import { Box, Text } from 'ink';
import type React from 'react';
import type { Instance } from '../../session/instance.js';

export interface TerminalProps {
  instance: Instance | null;
  height: number;
  width: number;
}

/**
 * Placeholder Terminal tab. When the user actually presses Enter to attach,
 * the host App unmounts Ink and spawns `tmux attach` through node-pty (see
 * src/session/tmux/attach.ts), then re-mounts Ink on detach.
 */
export function Terminal({ instance, height, width }: TerminalProps): React.ReactElement {
  return (
    <Box height={height} width={width} flexDirection="column">
      <Text color="gray">Terminal tab</Text>
      <Text color="gray">
        Press <Text color="cyan">↵</Text> to attach interactively to{' '}
        <Text color="white">{instance?.title ?? '(none)'}</Text>.
      </Text>
      <Text color="gray">
        While attached, press <Text color="cyan">Ctrl+Q</Text> to detach.
      </Text>
    </Box>
  );
}
