import { useKeyboard } from '@opentui/solid';
import { colors } from '../../shared/styles.js';

export interface ConfirmationOverlayProps {
  message: string;
  width: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationOverlay(props: ConfirmationOverlayProps) {
  useKeyboard((e) => {
    const name = e.name;
    if (name === 'escape' || name === 'n' || name === 'N') {
      props.onCancel();
      return;
    }
    if (name === 'return' || name === 'y' || name === 'Y') {
      props.onConfirm();
    }
  });

  return (
    <box
      flexDirection="column"
      borderStyle="double"
      borderColor={colors.warning}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      width={props.width}
    >
      <text>{props.message}</text>
      <box flexDirection="row" gap={2} paddingTop={1}>
        <text fg={colors.success}>[Y] Yes</text>
        <text fg={colors.danger}>[N] No</text>
      </box>
    </box>
  );
}
