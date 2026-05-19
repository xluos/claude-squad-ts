import { Box, Text } from 'ink';
import type React from 'react';
import type { Instance } from '../../session/instance.js';
import { colors, icons } from '../../shared/styles.js';
import { Status } from '../../shared/types.js';

export interface InstanceListProps {
  instances: Instance[];
  selectedIndex: number;
  width: number;
  height: number;
  autoYes?: boolean;
}

export function InstanceList({
  instances,
  selectedIndex,
  width,
  height,
  autoYes,
}: InstanceListProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box width={width - 2} justifyContent="space-between" paddingX={1}>
        <Text backgroundColor={colors.primary} color="white" bold>
          {' Instances '}
        </Text>
        {autoYes ? (
          <Text backgroundColor={colors.warning} color="black" bold>
            {' auto-yes '}
          </Text>
        ) : (
          <Text> </Text>
        )}
      </Box>
      <Box
        flexGrow={1}
        flexDirection="column"
        width={width}
        borderStyle="round"
        borderColor={colors.borderActive}
        paddingX={1}
        paddingY={0}
      >
        {instances.length === 0 ? (
          <Box paddingTop={1}>
            <Text color="gray">
              No instances. Press <Text color="cyan">n</Text> to create.
            </Text>
          </Box>
        ) : (
          instances.map((inst, idx) => (
            <Row
              key={inst.title}
              instance={inst}
              index={idx + 1}
              selected={idx === selectedIndex}
              width={width - 4}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

interface RowProps {
  instance: Instance;
  index: number;
  selected: boolean;
  width: number;
}

function Row({ instance, index, selected, width }: RowProps): React.ReactElement {
  const displayName = instance.displayName || instance.title;
  const iconColor = iconColorFor(instance.status);
  const diffStr =
    instance.diffStats.added > 0 || instance.diffStats.removed > 0
      ? `+${instance.diffStats.added},-${instance.diffStats.removed}`
      : '';

  // Two-line entry. Highlight whole block with background when selected.
  const bg = selected ? colors.selectedBg : undefined;
  const titleColor = selected ? 'white' : 'white';
  const branchColor = selected ? colors.muted : colors.muted;

  return (
    <Box flexDirection="column" width={width} marginTop={1}>
      <Box width={width} justifyContent="space-between" backgroundColor={bg}>
        <Text backgroundColor={bg} color={titleColor}>
          <Text color={colors.muted}>{`${index}. `}</Text>
          <Text bold backgroundColor={bg} color={titleColor}>
            {displayName}
          </Text>
        </Text>
        <Text color={iconColor} backgroundColor={bg}>
          {iconFor(instance.status)}
        </Text>
      </Box>
      <Box width={width} justifyContent="space-between" backgroundColor={bg}>
        <Text color={branchColor} backgroundColor={bg}>
          {`   λ-${truncate(instance.branch || '(pending)', Math.max(8, width - 18))}`}
        </Text>
        {diffStr && (
          <Text backgroundColor={bg}>
            <Text color={colors.diffAdded} backgroundColor={bg}>
              {`+${instance.diffStats.added}`}
            </Text>
            <Text color={colors.muted} backgroundColor={bg}>
              {','}
            </Text>
            <Text color={colors.diffRemoved} backgroundColor={bg}>
              {`-${instance.diffStats.removed}`}
            </Text>
          </Text>
        )}
      </Box>
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return '…';
  return `${s.slice(0, max - 1)}…`;
}
