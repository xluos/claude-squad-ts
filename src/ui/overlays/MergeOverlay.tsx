import { useKeyboard } from '@opentui/solid';
import { For, Show } from 'solid-js';
import type { MergePreview } from '../../app/state.js';
import { colors } from '../../shared/styles.js';

export interface MergeOverlayProps {
  preview: MergePreview;
  width: number;
  /** Run the actual `git merge` in the host repo. Only ever called when
   * the precheck reported no conflicts. */
  onConfirm: () => void;
  /** Pause/checkout the source instance so the user can resolve manually
   * (and copy the branch name to the clipboard, matching the `c` flow). */
  onCheckout: () => void;
  /** Build an agent prompt and write it to the clipboard. */
  onCopyAgentPrompt: () => void;
  /** Esc / cancel. */
  onCancel: () => void;
}

/**
 * Result of the merge precheck visualized as a single overlay.
 *
 *  - Clean & no blocker → "merge X into Y" + [Y] confirm / [N] cancel.
 *  - Conflicts present → list paths + offer Checkout / Copy-prompt / Cancel.
 *  - Blocker (dirty host, detached HEAD, ...) → show the reason + Esc.
 */
export function MergeOverlay(props: MergeOverlayProps) {
  useKeyboard((e) => {
    const name = e.name;
    if (name === 'escape') {
      props.onCancel();
      return;
    }
    if (props.preview.blocker) return; // only Esc is meaningful for blockers

    if (props.preview.conflicts.length === 0) {
      // Clean path: Y/Enter = merge, N = cancel.
      if (name === 'return' || name === 'y' || name === 'Y') {
        props.onConfirm();
        return;
      }
      if (name === 'n' || name === 'N') {
        props.onCancel();
      }
      return;
    }

    // Conflict path
    if (name === 'c' || name === 'C') {
      props.onCheckout();
      return;
    }
    if (name === 'p' || name === 'P') {
      props.onCopyAgentPrompt();
    }
  });

  const clean = () => !props.preview.blocker && props.preview.conflicts.length === 0;
  const headerColor = () => {
    if (props.preview.blocker) return colors.danger;
    if (props.preview.conflicts.length > 0) return colors.warning;
    return colors.primary;
  };
  const headerText = () => {
    if (props.preview.blocker) return 'Cannot merge';
    if (props.preview.conflicts.length > 0) return 'Conflicts detected';
    return props.preview.killAfter ? 'Ready to merge & retire' : 'Ready to merge';
  };

  return (
    <box
      flexDirection="column"
      borderStyle="double"
      borderColor={headerColor()}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      width={props.width}
      gap={1}
    >
      <text fg={headerColor()} attributes={1}>
        {headerText()}
      </text>

      <box flexDirection="column">
        <box flexDirection="row">
          <text fg={colors.muted}>{'from  '}</text>
          <text fg="cyan" attributes={1}>
            {props.preview.sourceBranch || '(unknown)'}
          </text>
        </box>
        <box flexDirection="row">
          <text fg={colors.muted}>{'into  '}</text>
          <text fg="cyan" attributes={1}>
            {props.preview.hostBranch || '(detached HEAD)'}
          </text>
        </box>
      </box>

      <Show when={props.preview.blocker}>
        <text fg={colors.danger}>{props.preview.blocker}</text>
      </Show>

      <Show when={props.preview.conflicts.length > 0}>
        <box flexDirection="column">
          <text fg={colors.warning}>Conflicting files:</text>
          <For each={props.preview.conflicts.slice(0, 8)}>
            {(p) => <text fg="white">{`  ${p}`}</text>}
          </For>
          <Show when={props.preview.conflicts.length > 8}>
            <text fg={colors.muted}>{`  … +${props.preview.conflicts.length - 8} more`}</text>
          </Show>
        </box>
      </Show>

      <Show when={clean() && props.preview.dirty}>
        <box flexDirection="column">
          <text fg={colors.warning}>{'⚠ Worktree has uncommitted changes.'}</text>
          <text fg={colors.muted}>
            {`  Confirming will auto-commit them to ${props.preview.sourceBranch || 'the source branch'} first, then merge.`}
          </text>
        </box>
      </Show>

      <Show when={clean() && props.preview.killAfter}>
        <box flexDirection="column">
          <text fg={colors.warning}>
            {'⚠ Instance will be killed after merge — tmux, worktree and branch all removed.'}
          </text>
          <text fg={colors.muted}>
            {'  Use [n] / Esc here if you want to keep the agent running.'}
          </text>
        </box>
      </Show>

      <Show when={clean()}>
        <box flexDirection="row" gap={2}>
          <text fg={colors.success}>
            {props.preview.killAfter ? '[Y / ↵] Merge & retire' : '[Y / ↵] Merge'}
          </text>
          <text fg={colors.danger}>[N / Esc] Cancel</text>
        </box>
      </Show>

      <Show when={props.preview.conflicts.length > 0}>
        <box flexDirection="column">
          <box flexDirection="row" gap={2}>
            <text fg="cyan" attributes={1}>
              [c]
            </text>
            <text>Checkout — pause this session and copy branch name</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text fg="cyan" attributes={1}>
              [p]
            </text>
            <text>{`Copy agent prompt (${agentLabel(props.preview.program)})`}</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text fg={colors.muted}>[esc]</text>
            <text fg={colors.muted}>Close</text>
          </box>
        </box>
      </Show>

      <Show when={props.preview.blocker}>
        <text fg={colors.muted}>Press Esc to close.</text>
      </Show>
    </box>
  );
}

/** Extracts the CLI binary name from an instance's `program` string. */
export function agentLabel(program: string): string {
  const first = program.trim().split(/\s+/)[0] ?? 'claude';
  const base = first.split('/').pop() ?? first;
  return base || 'claude';
}
