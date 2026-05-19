import { createEffect, createSignal, on, onCleanup } from 'solid-js';
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
      setContent(await inst.preview());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  // Re-fetch when the selected instance changes, and on a 100ms tick.
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

  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
      {err() ? (
        <text fg={colors.danger}>{err()}</text>
      ) : !props.instance ? (
        <text fg={colors.muted}>Select an instance to preview</text>
      ) : (
        <text>{content() || ' '}</text>
      )}
    </box>
  );
}
