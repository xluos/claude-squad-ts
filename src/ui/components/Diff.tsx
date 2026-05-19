import { createEffect, createSignal, For, on } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { colors } from '../../shared/styles.js';

export interface DiffProps {
  instance: Instance | null;
}

export function Diff(props: DiffProps) {
  const [content, setContent] = createSignal('');
  const [err, setErr] = createSignal<string | null>(null);

  createEffect(
    on(
      () => props.instance?.title,
      async () => {
        const inst = props.instance;
        if (!inst) {
          setContent('');
          return;
        }
        try {
          const stats = await inst.computeDiff();
          setContent(stats.content ?? '');
          setErr(stats.error ?? null);
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      },
    ),
  );

  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
      {err() ? (
        <text fg={colors.danger}>{err()}</text>
      ) : !props.instance ? (
        <text fg={colors.muted}>Select an instance to view diff</text>
      ) : !content() ? (
        <text fg={colors.muted}>No changes yet</text>
      ) : (
        <For each={content().split('\n')}>
          {(line) => <text fg={colorFor(line)}>{line || ' '}</text>}
        </For>
      )}
    </box>
  );
}

function colorFor(line: string): string | undefined {
  if (line.startsWith('+++') || line.startsWith('---')) return colors.muted;
  if (line.startsWith('@@')) return colors.accent;
  if (line.startsWith('+')) return colors.diffAdded;
  if (line.startsWith('-')) return colors.diffRemoved;
  return undefined;
}
