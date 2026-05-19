import { createEffect, onCleanup, Show } from 'solid-js';
import { ERROR_DISMISS_MS } from '../../shared/constants.js';
import { colors } from '../../shared/styles.js';

export interface ErrorBoxProps {
  message: string | null;
  width?: number;
  onDismiss?: () => void;
}

export function ErrorBox(props: ErrorBoxProps) {
  createEffect(() => {
    if (!props.message) return;
    const id = setTimeout(() => props.onDismiss?.(), ERROR_DISMISS_MS);
    onCleanup(() => clearTimeout(id));
  });

  return (
    <Show when={props.message}>
      <box
        borderStyle="rounded"
        borderColor={colors.danger}
        paddingLeft={1}
        paddingRight={1}
        width={props.width}
        flexShrink={0}
      >
        <text fg={colors.danger}>⚠ {props.message}</text>
      </box>
    </Show>
  );
}
