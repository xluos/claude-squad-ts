import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { ERROR_DISMISS_MS } from '../../shared/constants.js';

export interface ErrorBoxProps {
  message: string | null;
  onDismiss?: () => void;
  width?: number;
}

export function ErrorBox({ message, onDismiss, width }: ErrorBoxProps): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const id = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, ERROR_DISMISS_MS);
    return () => clearTimeout(id);
  }, [message, onDismiss]);

  if (!visible || !message) return null;

  return (
    <Box width={width} borderStyle="round" borderColor="red" paddingX={1}>
      <Text color="red">⚠ {message}</Text>
    </Box>
  );
}
