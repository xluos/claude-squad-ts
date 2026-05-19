import { Box, Text } from 'ink';
import React from 'react';
import { colors } from '../../shared/styles.js';

export type TabId = 'preview' | 'diff' | 'terminal';

export interface TabbedWindowProps {
  active: TabId;
  width: number;
  height: number;
  children: React.ReactNode;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'diff', label: 'Diff' },
  { id: 'terminal', label: 'Terminal' },
];

export function TabbedWindow({
  active,
  width,
  height,
  children,
}: TabbedWindowProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box>
        {TABS.map((t, i) => (
          <React.Fragment key={t.id}>
            {i > 0 && <Text color="gray"> · </Text>}
            <Text
              bold={active === t.id}
              color={active === t.id ? colors.tabActive : colors.tabInactive}
            >
              {active === t.id ? `[${t.label}]` : ` ${t.label} `}
            </Text>
          </React.Fragment>
        ))}
      </Box>
      <Box
        borderStyle="round"
        borderColor={colors.border}
        width={width}
        height={height - 1}
        paddingX={1}
      >
        {children}
      </Box>
    </Box>
  );
}

export function nextTab(id: TabId): TabId {
  const idx = TABS.findIndex((t) => t.id === id);
  return TABS[(idx + 1) % TABS.length]!.id;
}
