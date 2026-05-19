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

  // Split the raw tmux capture on newlines so each visual row is its own
  // <text> with its own StyledText. This keeps OpenTUI's wide-character
  // wrapping correct (it measures each line independently) and avoids the
  // single-string layout glitch that mangled the box-drawing glyphs.
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
        <For each={lines()}>{(line) => <text content={ansiToStyledText(line || ' ')} />}</For>
      )}
    </box>
  );
}
