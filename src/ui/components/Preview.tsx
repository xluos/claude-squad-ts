import type { TextRenderable } from '@opentui/core';
import { createEffect, createSignal, For, on, onCleanup } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { PREVIEW_TICK_MS } from '../../shared/constants.js';
import { colors } from '../../shared/styles.js';
import { ansiToStyledText } from '../util/ansi.js';

export interface PreviewProps {
  instance: Instance | null;
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
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
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
 * `<text content={styledText}>` doesn't work in @opentui/solid@0.2.14 because
 * the reconciler's setProp coerces `content` to a string (`\`${value}\``),
 * turning our StyledText into "[object Object]". We bypass that by holding
 * a ref to the TextRenderable and assigning `.content` imperatively in a
 * reactive effect — same effect as setting it via JSX, but skips the
 * stringify path.
 */
function StyledLine(props: { line: string }) {
  let ref: TextRenderable | undefined;

  createEffect(() => {
    if (!ref) return;
    ref.content = ansiToStyledText(props.line);
  });

  return (
    <text
      ref={(r: TextRenderable) => {
        ref = r;
        // Initial value so we don't render an empty line on first paint
        // before the createEffect above runs.
        r.content = ansiToStyledText(props.line);
      }}
    />
  );
}
