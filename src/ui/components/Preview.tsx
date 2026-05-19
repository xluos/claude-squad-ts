import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { Instance } from '../../session/instance.js';
import { PREVIEW_TICK_MS } from '../../shared/constants.js';
import { useInterval } from '../hooks/useInterval.js';

export interface PreviewProps {
  instance: Instance | null;
  height: number;
  width: number;
}

export function Preview({ instance, height, width }: PreviewProps): React.ReactElement {
  const [content, setContent] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    if (!instance) {
      setContent('');
      return;
    }
    try {
      const c = await instance.preview();
      setContent(c);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.title]);

  useInterval(() => void refresh(), instance ? PREVIEW_TICK_MS : null);

  if (!instance) {
    return (
      <Box height={height} width={width}>
        <Text color="gray">Select an instance to preview</Text>
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
  const lines = clipToBox(content, width, height);
  return (
    <Box flexDirection="column" height={height} width={width}>
      {lines.map((line, i) => (
        <Text key={i}>{line || ' '}</Text>
      ))}
    </Box>
  );
}

function clipToBox(content: string, width: number, height: number): string[] {
  const all = content.split('\n');
  const start = Math.max(0, all.length - height);
  return all.slice(start, start + height).map((l) => l.slice(0, width));
}
