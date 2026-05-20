import { createEffect, onCleanup, Show } from 'solid-js';
import { ERROR_DISMISS_MS } from '../../shared/constants.js';
import { colors } from '../../shared/styles.js';

export interface ErrorBoxProps {
  message: string | null;
  /** Visual level — 'error' (red ⚠) or 'info' (green ✓). Defaults to 'error'. */
  kind?: 'error' | 'info';
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
        borderColor={props.kind === 'info' ? colors.success : colors.danger}
        backgroundColor={colors.overlayBg}
        paddingLeft={1}
        paddingRight={1}
        width={props.width}
        flexShrink={0}
      >
        <text fg={props.kind === 'info' ? colors.success : colors.danger} bg={colors.overlayBg}>
          {props.kind === 'info' ? '✓ ' : '⚠ '}
          {props.message}
        </text>
      </box>
    </Show>
  );
}
