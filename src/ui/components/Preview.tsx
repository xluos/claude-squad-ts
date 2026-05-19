import { stripAnsiSequences } from '@opentui/core';
import { createEffect, createSignal, For, on, onCleanup } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { PREVIEW_TICK_MS } from '../../shared/constants.js';
import { colors } from '../../shared/styles.js';

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
      const raw = await inst.preview();
      // tmux capture-pane -e gives us a stream peppered with SGR/CSI escapes.
      // OpenTUI's <text> doesn't render ANSI inline (it would need StyledText
      // / extmarks), so we strip the escape sequences for now. Colours are
      // lost but the content is readable.
      setContent(stripAnsiSequences(raw));
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
        <For each={lines()}>{(line) => <text>{line || ' '}</text>}</For>
      )}
    </box>
  );
}
