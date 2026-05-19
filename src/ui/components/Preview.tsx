import type { TextRenderable } from '@opentui/core';
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { PREVIEW_TICK_MS } from '../../shared/constants.js';
import { colors } from '../../shared/styles.js';
import { ansiToStyledText } from '../util/ansi.js';

export interface PreviewProps {
  instance: Instance | null;
  width: number;
  height: number;
  /** Frozen scrollback view while true; tail follow when false. */
  scrollMode: boolean;
  /** Lines scrolled up from the bottom of the available content. */
  scrollOffset: number;
  /** Mouse-wheel callback (delta: positive = down, negative = up). */
  onScroll?: (direction: 'up' | 'down') => void;
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
      () => [props.instance?.title, props.width, props.height] as const,
      ([title, w, h]) => {
        if (!title || w <= 0 || h <= 0) return;
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
      () => [props.instance?.title, props.scrollMode] as const,
      ([title, scrolling]) => {
        if (!title) return;
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
      () => [props.instance?.title, props.scrollMode] as const,
      async ([title, scrolling]) => {
        if (!title || !scrolling) return;
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

  /** Lines from whichever source the current mode selects. */
  const allLines = createMemo(() => {
    const src = props.scrollMode ? historyContent() : liveContent();
    return src ? src.split('\n') : [];
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

  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
      {err() ? (
        <text fg={colors.danger}>{err()}</text>
      ) : !props.instance ? (
        <text fg={colors.muted}>Select an instance to preview</text>
      ) : visibleLines().length === 0 ? (
        <text fg={colors.muted}>(empty)</text>
      ) : (
        <For each={visibleLines()}>{(line) => <StyledLine line={line || ' '} />}</For>
      )}
      <Show when={props.scrollMode}>
        <text fg={colors.muted}>
          {`-- scroll mode (offset ${props.scrollOffset}) — Esc to follow tail --`}
        </text>
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
