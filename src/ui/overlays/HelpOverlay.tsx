import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { DEFAULT_BINDINGS } from '../../shared/keymap.js';

export interface HelpOverlayProps {
  width: number;
  onClose: () => void;
}

export function HelpOverlay({ width, onClose }: HelpOverlayProps): React.ReactElement {
  useInput(() => onClose());
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="magenta"
      paddingX={2}
      paddingY={1}
      width={width}
    >
      <Text bold color="magenta">
        Help — press any key to close
      </Text>
      <Box marginTop={1} flexDirection="column">
        {DEFAULT_BINDINGS.map((b) => (
          <Text key={b.key}>
            <Text color="cyan" bold>
              [{b.label}]
            </Text>
            <Text> {b.desc}</Text>
          </Text>
        ))}
        <Text color="gray">Ctrl+Q during attach = detach</Text>
      </Box>
    </Box>
  );
}
