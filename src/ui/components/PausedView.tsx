import { For, Show } from 'solid-js';
import { t } from '../../shared/i18n.js';
import { colors, icons } from '../../shared/styles.js';

export interface PausedViewProps {
  /** Which pane is showing it — used to phrase the leading sentence. */
  pane: 'preview' | 'diff';
  /** Branch this instance is on (worktree may be gone but branch persists). */
  branch?: string;
}

interface Action {
  key: string;
  title: () => string;
  desc: () => string;
}

const ACTIONS: Action[] = [
  {
    key: 'r',
    title: () => t((m) => m.paused.actions.resumeTitle),
    desc: () => t((m) => m.paused.actions.resumeDesc),
  },
  {
    key: 's',
    title: () => t((m) => m.paused.actions.submitTitle),
    desc: () => t((m) => m.paused.actions.submitDesc),
  },
  {
    key: 'm',
    title: () => t((m) => m.paused.actions.mergeTitle),
    desc: () => t((m) => m.paused.actions.mergeDesc),
  },
  {
    key: 'd',
    title: () => t((m) => m.paused.actions.killTitle),
    desc: () => t((m) => m.paused.actions.killDesc),
  },
];

/**
 * Replaces the lone "⏸ Paused — Press r to resume." line in Preview/Diff
 * with a centered card that explains the state and lists actionable
 * next-step shortcuts. Card layout keeps each row left-aligned in a
 * fixed two-column grid so keys + descriptions don't visually zigzag.
 */
export function PausedView(props: PausedViewProps) {
  const headline = () =>
    props.pane === 'preview' ? t((m) => m.paused.headlinePreview) : t((m) => m.paused.headlineDiff);

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
            {`${icons.paused}  ${t((m) => m.paused.title)}`}
          </text>
        </box>
        <text fg={colors.muted}>{headline()}</text>

        <Show when={props.branch}>
          <text> </text>
          <box flexDirection="row">
            <text fg={colors.muted}>{t((m) => m.paused.branchLabel)}</text>
            <text fg={colors.accent} attributes={1}>
              {props.branch}
            </text>
            <text fg={colors.muted}>{t((m) => m.paused.branchPreserved)}</text>
          </box>
        </Show>

        <text> </text>
        <text fg={colors.muted}>{t((m) => m.paused.whatNow)}</text>
        <For each={ACTIONS}>
          {(a) => (
            <box flexDirection="row">
              <text fg="cyan" attributes={1}>
                {`  ${a.key}  `}
              </text>
              <text fg="white">{a.title().padEnd(10)}</text>
              <text fg={colors.muted}>{a.desc()}</text>
            </box>
          )}
        </For>
      </box>
    </box>
  );
}
