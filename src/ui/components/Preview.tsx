import type { TextRenderable } from '@opentui/core';
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { PREVIEW_TICK_MS } from '../../shared/constants.js';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';
import { ansiToStyledText } from '../util/ansi.js';
import { Logo } from './Logo.js';
import { PausedView } from './PausedView.js';

export interface PreviewProps {
  instance: Instance | null;
  /** True when the selected instance has been checked out (paused) — its
   * tmux session has been killed, so we render a hint instead of probing
   * a dead session and showing the empty capture. */
  paused: boolean;
  /** True when the instance's tmux died externally (Status.Error). We
   *  render a "press r to recover" message instead of either the live
   *  tail (which would just spam capture errors) or the paused view
   *  (which implies a clean state, which this isn't). */
  errored: boolean;
  width: number;
  height: number;
  /** Frozen scrollback view while true; tail follow when false. */
  scrollMode: boolean;
  /** Lines scrolled up from the bottom of the available content. */
  scrollOffset: number;
  /** Mouse-wheel callback (delta: positive = down, negative = up). */
  onScroll?: (direction: 'up' | 'down') => void;
  /** Report the max scrollable offset so the store can gate `scrollUp`
   *  once the user has hit the top of the buffer. Computed from the
   *  current content source (history while scrolling) and viewport. */
  onScrollLimit?: (max: number) => void;
}

export function Preview(props: PreviewProps) {
  const [liveContent, setLiveContent] = createSignal('');
  const [historyContent, setHistoryContent] = createSignal('');
  const [err, setErr] = createSignal<string | null>(null);

  const refreshLive = async () => {
    const inst = props.instance;
    if (!inst) {
      setLiveContent('');
      return;
    }
    try {
      setLiveContent(await inst.preview());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  // Resize tmux to viewport whenever it changes.
  createEffect(
    on(
      () => [props.instance?.title, props.paused, props.width, props.height] as const,
      ([title, paused, w, h]) => {
        if (!title || paused || w <= 0 || h <= 0) return;
        const inst = props.instance;
        if (!inst) return;
        const id = setTimeout(() => {
          inst.resizeTmux(w, h).catch(() => undefined);
        }, 80);
        onCleanup(() => clearTimeout(id));
      },
    ),
  );

  // Live tail: refresh every 100ms while not in scroll mode.
  createEffect(
    on(
      () => [props.instance?.title, props.paused, props.errored, props.scrollMode] as const,
      ([title, paused, errored, scrolling]) => {
        if (!title) return;
        if (paused || errored) {
          // Paused or errored: tmux is gone or unhealthy — drop the
          // stale capture so a later resume/recovery doesn't briefly
          // flash the previous content, and skip polling since the
          // render branch below already explains the state.
          setLiveContent('');
          setHistoryContent('');
          setErr(null);
          return;
        }
        if (scrolling) return; // Frozen view; the history snapshot already loaded.
        void refreshLive();
        const id = setInterval(() => void refreshLive(), PREVIEW_TICK_MS);
        onCleanup(() => clearInterval(id));
      },
    ),
  );

  // Capture full scrollback once when entering scroll mode.
  createEffect(
    on(
      () => [props.instance?.title, props.paused, props.scrollMode] as const,
      async ([title, paused, scrolling]) => {
        if (!title || paused || !scrolling) return;
        const inst = props.instance;
        if (!inst) return;
        try {
          setHistoryContent(await inst.previewFullHistory());
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      },
    ),
  );

  /** Lines from whichever source the current mode selects.
   *  tmux capture-pane terminates its output with a trailing `\n`, so a
   *  naive `split('\n')` produces N+1 elements (N real lines + 1 empty
   *  string at the end). With `cap = props.height = pane rows`, the
   *  bottom-aligned slice `[length-cap, length)` then silently drops
   *  the FIRST real line. Trim the trailing newline once so length ==
   *  actual line count. */
  const allLines = createMemo(() => {
    const raw = props.scrollMode ? historyContent() : liveContent();
    if (!raw) return [];
    const src = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
    return src.split('\n');
  });

  /** Window of lines actually rendered, bottom-aligned with offset applied. */
  const visibleLines = createMemo(() => {
    const all = allLines();
    if (all.length === 0) return [];
    // We reserve 1 row for the scroll-mode footer when active.
    const cap = Math.max(1, props.height - (props.scrollMode ? 1 : 0));
    const end = Math.max(0, all.length - props.scrollOffset);
    const start = Math.max(0, end - cap);
    return all.slice(start, end);
  });

  // Push scrollMax to the store whenever content/height changes while in
  // scroll mode. Pinned-to-bottom mode doesn't need a limit (it's always
  // showing the tail).
  createEffect(() => {
    if (!props.scrollMode) return;
    const total = allLines().length;
    if (total === 0) return;
    const cap = Math.max(1, props.height - 1);
    props.onScrollLimit?.(Math.max(0, total - cap));
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
      onMouseScroll={(e) => {
        const dir = e.scroll?.direction;
        if (dir === 'up') props.onScroll?.('up');
        else if (dir === 'down') props.onScroll?.('down');
      }}
    >
      {props.errored ? (
        <Logo caption={t((m) => m.preview.errorRecover)} />
      ) : err() ? (
        <Logo caption={t((m) => m.preview.errorPrefix)(err() ?? '')} />
      ) : !props.instance ? (
        <Logo caption={t((m) => m.preview.pressNToCreate)} />
      ) : props.paused ? (
        <PausedView pane="preview" branch={props.instance?.branch} />
      ) : visibleLines().length === 0 ? (
        <text fg={colors.muted}>{t((m) => m.preview.emptyCapture)}</text>
      ) : (
        <For each={visibleLines()}>{(line) => <StyledLine line={line || ' '} />}</For>
      )}
      <Show when={props.scrollMode}>
        <text fg={colors.muted}>{t((m) => m.preview.scrollFooter)(props.scrollOffset)}</text>
      </Show>
    </box>
  );
}

function StyledLine(props: { line: string }) {
  let ref: TextRenderable | undefined;
  createEffect(() => {
    if (!ref) return;
    ref.content = ansiToStyledText(props.line);
  });
  return (
    <text
      wrapMode="none"
      ref={(r: TextRenderable) => {
        ref = r;
        r.content = ansiToStyledText(props.line);
      }}
    />
  );
}
