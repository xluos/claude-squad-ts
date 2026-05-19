import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { Instance } from '../../session/instance.js';
import { colors } from '../../shared/styles.js';

export interface DiffProps {
  instance: Instance | null;
  height: number;
  width: number;
}

export function Diff({ instance, height, width }: DiffProps): React.ReactElement {
  const [content, setContent] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!instance) {
      setContent('');
      return;
    }
    instance
      .computeDiff()
      .then((stats) => {
        if (cancelled) return;
        setContent(stats.content ?? '');
        setErr(stats.error ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [instance?.title]);

  if (!instance) {
    return (
      <Box height={height} width={width}>
        <Text color="gray">Select an instance to view diff</Text>
      </Box>
    );
  }
  if (err) {
    return (
      <Box height={height} width={width}>
        <Text color="red">{err}</Text>
      </Box>
    );
  }
  if (!content) {
    return (
      <Box height={height} width={width}>
        <Text color="gray">No changes yet</Text>
      </Box>
    );
  }
  const lines = content.split('\n').slice(0, height);
  return (
    <Box flexDirection="column" height={height} width={width}>
      {lines.map((line, i) => (
        <Text key={i} color={colorFor(line)}>
          {line.slice(0, width) || ' '}
        </Text>
      ))}
    </Box>
  );
}

function colorFor(line: string): string | undefined {
  if (line.startsWith('+++') || line.startsWith('---')) return colors.muted;
  if (line.startsWith('@@')) return colors.accent;
  if (line.startsWith('+')) return colors.diffAdded;
  if (line.startsWith('-')) return colors.diffRemoved;
  return undefined;
}
