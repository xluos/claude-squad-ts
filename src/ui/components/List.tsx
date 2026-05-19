import { Box, Text } from 'ink';
import type React from 'react';
import type { Instance } from '../../session/instance.js';
import { colors, icons } from '../../shared/styles.js';
import { Status, statusLabel } from '../../shared/types.js';

export interface InstanceListProps {
  instances: Instance[];
  selectedIndex: number;
  width: number;
  height: number;
}

export function InstanceList({
  instances,
  selectedIndex,
  width,
  height,
}: InstanceListProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.borderActive}
      width={width}
      height={height}
      paddingX={1}
    >
      <Text bold color={colors.primary}>
        Instances
      </Text>
      {instances.length === 0 ? (
        <Box marginTop={1}>
          <Text color="gray">
            No instances yet. Press <Text color="cyan">n</Text> to create one.
          </Text>
        </Box>
      ) : (
        instances.map((inst, idx) => (
          <Row key={inst.title} instance={inst} selected={idx === selectedIndex} />
        ))
      )}
    </Box>
  );
}

interface RowProps {
  instance: Instance;
  selected: boolean;
}

function Row({ instance, selected }: RowProps): React.ReactElement {
  const displayName = instance.displayName || instance.title;
  const icon = iconFor(instance.status);
  const iconColor = iconColorFor(instance.status);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={selected ? colors.accent : iconColor}>
          {selected ? icons.selected : ' '} {icon}
        </Text>
        <Text bold color={selected ? colors.accent : 'white'}>
          {' '}
          {displayName}
        </Text>
        <Text color="gray"> ({statusLabel(instance.status)})</Text>
      </Box>
      <Box paddingLeft={4}>
        <Text color="gray">branch: </Text>
        <Text>{instance.branch || '(pending)'}</Text>
      </Box>
      {(instance.diffStats.added > 0 || instance.diffStats.removed > 0) && (
        <Box paddingLeft={4}>
          <Text color={colors.diffAdded}>+{instance.diffStats.added}</Text>
          <Text> </Text>
          <Text color={colors.diffRemoved}>-{instance.diffStats.removed}</Text>
        </Box>
      )}
    </Box>
  );
}

function iconFor(status: Status): string {
  switch (status) {
    case Status.Running:
      return icons.running;
    case Status.Ready:
      return icons.ready;
    case Status.Loading:
      return icons.loading;
    case Status.Paused:
      return icons.paused;
  }
}

function iconColorFor(status: Status): string {
  switch (status) {
    case Status.Running:
      return colors.statusRunning;
    case Status.Ready:
      return colors.statusReady;
    case Status.Loading:
      return colors.statusLoading;
    case Status.Paused:
      return colors.statusPaused;
  }
}
