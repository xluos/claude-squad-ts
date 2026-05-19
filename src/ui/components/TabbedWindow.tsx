import { Box, Text } from 'ink';
import type React from 'react';
import { colors } from '../../shared/styles.js';

export type TabId = 'preview' | 'diff';

export interface TabbedWindowProps {
  active: TabId;
  width: number;
  height: number;
  children: React.ReactNode;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'diff', label: 'Diff' },
];

export function TabbedWindow({
  active,
  width,
  height,
  children,
}: TabbedWindowProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box width={width} justifyContent="space-around">
        {TABS.map((t) => (
          <Box key={t.id} flexGrow={1} justifyContent="center">
            <Text
              bold={active === t.id}
              color={active === t.id ? colors.tabActive : colors.tabInactive}
            >
              {active === t.id ? t.label : t.label}
            </Text>
          </Box>
        ))}
      </Box>
      <Box flexGrow={1} width={width}>
        {children}
      </Box>
    </Box>
  );
}

export function nextTab(id: TabId): TabId {
  return id === 'preview' ? 'diff' : 'preview';
}
