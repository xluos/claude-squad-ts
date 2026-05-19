import { Box, Text, useInput } from 'ink';
import type React from 'react';

export interface ConfirmationOverlayProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  width: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationOverlay({
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  width,
  onConfirm,
  onCancel,
}: ConfirmationOverlayProps): React.ReactElement {
  useInput((input, key) => {
    if (key.escape || input === 'n' || input === 'N') {
      onCancel();
      return;
    }
    if (key.return || input === 'y' || input === 'Y') {
      onConfirm();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      width={width}
    >
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text color="green">[Y] {confirmLabel}</Text>
        <Text> </Text>
        <Text color="red">[N] {cancelLabel}</Text>
      </Box>
    </Box>
  );
}
