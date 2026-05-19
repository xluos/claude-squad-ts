import { For, Show } from 'solid-js';
import { colors, icons } from '../../shared/styles.js';

export interface PausedViewProps {
  /** Which pane is showing it — used to phrase the leading sentence. */
  pane: 'preview' | 'diff';
  /** Branch this instance is on (worktree may be gone but branch persists). */
  branch?: string;
}

interface Action {
  key: string;
  title: string;
  desc: string;
}

const ACTIONS: Action[] = [
  { key: 'r', title: 'resume', desc: 'recreate worktree, reattach agent' },
  { key: 's', title: 'submit PR', desc: 'push this branch upstream' },
  { key: 'm', title: 'merge', desc: 'fold branch into your host branch' },
  { key: 'd', title: 'kill', desc: 'drop branch + worktree entirely' },
];

/**
 * Replaces the lone "⏸ Paused — Press r to resume." line in Preview/Diff
 * with a centered card that explains the state and lists actionable
 * next-step shortcuts. Card layout keeps each row left-aligned in a
 * fixed two-column grid so keys + descriptions don't visually zigzag.
 */
export function PausedView(props: PausedViewProps) {
  const headline = () =>
    props.pane === 'preview'
      ? 'worktree checked out, tmux frozen'
      : 'worktree removed, no diff to compute';

  return (
    <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor={colors.statusPaused}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <box flexDirection="row">
          <text fg={colors.statusPaused} attributes={1}>
            {`${icons.paused}  Session paused`}
          </text>
        </box>
        <text fg={colors.muted}>{headline()}</text>

        <Show when={props.branch}>
          <text> </text>
          <box flexDirection="row">
            <text fg={colors.muted}>{'branch  '}</text>
            <text fg={colors.accent} attributes={1}>
              {props.branch}
            </text>
            <text fg={colors.muted}>{'  (preserved)'}</text>
          </box>
        </Show>

        <text> </text>
        <text fg={colors.muted}>What now</text>
        <For each={ACTIONS}>
          {(a) => (
            <box flexDirection="row">
              <text fg="cyan" attributes={1}>
                {`  ${a.key}  `}
              </text>
              <text fg="white">{a.title.padEnd(10)}</text>
              <text fg={colors.muted}>{a.desc}</text>
            </box>
          )}
        </For>
      </box>
    </box>
  );
}
