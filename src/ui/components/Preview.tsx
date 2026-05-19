import type { TextRenderable } from '@opentui/core';
import { createEffect, createSignal, For, on, onCleanup } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { PREVIEW_TICK_MS } from '../../shared/constants.js';
import { colors } from '../../shared/styles.js';
import { ansiToStyledText } from '../util/ansi.js';

export interface PreviewProps {
  instance: Instance | null;
  /** Visible width of the preview content (cells). Passed down so we can
   *  resize the underlying tmux session to match — without this, lines
   *  captured at the tmux-default 80 cols overflow the narrower preview
   *  pane and OpenTUI wraps them, breaking the agent's box-drawing UI. */
  width: number;
  height: number;
}

export function Preview(props: PreviewProps) {
  const [content, setContent] = createSignal('');
  const [err, setErr] = createSignal<string | null>(null);

  const refresh = async () => {
    const inst = props.instance;
    if (!inst) {
      setContent('');
      return;
    }
    try {
      setContent(await inst.preview());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  // Resize the tmux session to match the preview viewport whenever the
  // viewport or the selected instance changes. Debounced so a rapid resize
  // doesn't spam tmux.
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

  createEffect(
    on(
      () => props.instance?.title,
      () => {
        void refresh();
        const id = setInterval(() => void refresh(), PREVIEW_TICK_MS);
        onCleanup(() => clearInterval(id));
      },
    ),
  );

  const lines = () => (content() ? content().split('\n') : []);

  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
      {err() ? (
        <text fg={colors.danger}>{err()}</text>
      ) : !props.instance ? (
        <text fg={colors.muted}>Select an instance to preview</text>
      ) : lines().length === 0 ? (
        <text fg={colors.muted}>(empty)</text>
      ) : (
        <For each={lines()}>{(line) => <StyledLine line={line || ' '} />}</For>
      )}
    </box>
  );
}

/**
 * One preview line.
 *
 * Two reconciler workarounds at once:
 *
 * 1. `<text content={styledText}>` would otherwise stringify the StyledText
 *    to "[object Object]" because @opentui/solid@0.2.14's setProp has a
 *    `case "content"` branch that does `\`${value}\``. We bypass it by
 *    assigning via `ref.content = ...` which hits the real setter on
 *    TextRenderable (which natively accepts StyledText).
 *
 * 2. `wrapMode="none"` keeps each captured tmux row on a single visual
 *    line. Without this, OpenTUI soft-wraps any line wider than the
 *    preview pane, and the agent's box-drawing UI explodes into a
 *    multi-row mess (see the v0.2 screenshot regression). The
 *    parent box has `overflow="hidden"`, so the truncated tail is
 *    invisible rather than bleeding into the next row.
 */
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
