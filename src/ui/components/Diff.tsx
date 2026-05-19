import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { colors } from '../../shared/styles.js';
import { PausedView } from './PausedView.js';

export interface DiffProps {
  instance: Instance | null;
  /** True when the selected instance is paused (checked out) — its
   * worktree has been removed, so running `git diff` against the path
   * would error. We skip the call and render a hint instead. */
  paused: boolean;
  height: number;
  scrollMode: boolean;
  scrollOffset: number;
  onScroll?: (direction: 'up' | 'down') => void;
  /** Report the max scrollable offset so the store can gate `scrollUp`. */
  onScrollLimit?: (max: number) => void;
}

export function Diff(props: DiffProps) {
  const [content, setContent] = createSignal('');
  const [err, setErr] = createSignal<string | null>(null);

  createEffect(
    on(
      () => [props.instance?.title, props.paused] as const,
      async ([, paused]) => {
        const inst = props.instance;
        if (!inst) {
          setContent('');
          setErr(null);
          return;
        }
        if (paused) {
          setContent('');
          setErr(null);
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

  const lines = createMemo(() => (content() ? content().split('\n') : []));

  const visible = createMemo(() => {
    const all = lines();
    if (all.length === 0) return [];
    const cap = Math.max(1, props.height - (props.scrollMode ? 1 : 0));
    if (!props.scrollMode) return all.slice(0, cap);
    const end = Math.max(0, all.length - props.scrollOffset);
    const start = Math.max(0, end - cap);
    return all.slice(start, end);
  });

  createEffect(() => {
    if (!props.scrollMode) return;
    const total = lines().length;
    if (total === 0) return;
    const cap = Math.max(1, props.height - 1);
    props.onScrollLimit?.(Math.max(0, total - cap));
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
      onMouseScroll={(e: { scroll?: { direction: 'up' | 'down' | 'left' | 'right' } }) => {
        const dir = e.scroll?.direction;
        if (dir === 'up' || dir === 'down') props.onScroll?.(dir);
      }}
    >
      {err() ? (
        <text fg={colors.danger}>{err()}</text>
      ) : !props.instance ? (
        <text fg={colors.muted}>Select an instance to view diff</text>
      ) : props.paused ? (
        <PausedView pane="diff" branch={props.instance?.branch} />
      ) : !content() ? (
        <text fg={colors.muted}>No changes yet</text>
      ) : (
        <For each={visible()}>
          {(line) => (
            <text wrapMode="none" fg={colorFor(line)}>
              {line || ' '}
            </text>
          )}
        </For>
      )}
      <Show when={props.scrollMode}>
        <text fg={colors.muted}>
          {`-- scroll mode (offset ${props.scrollOffset}) — Esc to top --`}
        </text>
      </Show>
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
