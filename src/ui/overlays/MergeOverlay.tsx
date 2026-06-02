import { useKeyboard } from '@opentui/solid';
import { For, Show } from 'solid-js';
import type { MergePreview } from '../../app/state.js';
import { formatBlocker, t } from '../../shared/i18n.js';
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
    if (props.preview.blocker) return t((m) => m.merge.headerCannot);
    if (props.preview.conflicts.length > 0) return t((m) => m.merge.headerConflicts);
    if (props.preview.queued) {
      return props.preview.killAfter
        ? t((m) => m.merge.headerQueuedRetire)
        : t((m) => m.merge.headerQueued);
    }
    return props.preview.killAfter
      ? t((m) => m.merge.headerReadyRetire)
      : t((m) => m.merge.headerReady);
  };

  return (
    <box
      flexDirection="column"
      borderStyle="double"
      borderColor={headerColor()}
      backgroundColor={colors.overlayBg}
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
          <text fg={colors.muted}>{t((m) => m.merge.fromLabel)}</text>
          <text fg="cyan" attributes={1}>
            {props.preview.sourceBranch || t((m) => m.merge.unknownBranch)}
          </text>
        </box>
        <box flexDirection="row">
          <text fg={colors.muted}>{t((m) => m.merge.intoLabel)}</text>
          <text fg="cyan" attributes={1}>
            {props.preview.hostBranch || t((m) => m.merge.detachedHead)}
          </text>
        </box>
      </box>

      <Show when={props.preview.blocker}>
        {(b) => <text fg={colors.danger}>{formatBlocker(b())}</text>}
      </Show>

      <Show when={props.preview.conflicts.length > 0}>
        <box flexDirection="column">
          <text fg={colors.warning}>{t((m) => m.merge.conflictingFiles)}</text>
          <For each={props.preview.conflicts.slice(0, 8)}>
            {(p) => <text fg="white">{`  ${p}`}</text>}
          </For>
          <Show when={props.preview.conflicts.length > 8}>
            <text fg={colors.muted}>
              {t((m) => m.merge.moreFiles)(props.preview.conflicts.length - 8)}
            </text>
          </Show>
        </box>
      </Show>

      <Show when={clean() && props.preview.dirty}>
        <box flexDirection="column">
          <text fg={colors.warning}>{t((m) => m.merge.dirtyWarn)}</text>
          <text fg={colors.muted}>{t((m) => m.merge.dirtyDetail)(props.preview.sourceBranch)}</text>
        </box>
      </Show>

      <Show when={clean() && props.preview.killAfter}>
        <box flexDirection="column">
          <text fg={colors.warning}>{t((m) => m.merge.retireWarn)}</text>
          <text fg={colors.muted}>{t((m) => m.merge.retireDetail)}</text>
        </box>
      </Show>

      <Show when={clean() && props.preview.queued}>
        <box flexDirection="column">
          <text fg={colors.warning}>{t((m) => m.merge.queueWarn)}</text>
          <text fg={colors.muted}>{t((m) => m.merge.queueDetail)}</text>
        </box>
      </Show>

      <Show when={clean()}>
        <box flexDirection="row" gap={2}>
          <text fg={colors.success}>
            {props.preview.queued
              ? props.preview.killAfter
                ? t((m) => m.merge.confirmQueueRetire)
                : t((m) => m.merge.confirmQueue)
              : props.preview.killAfter
                ? t((m) => m.merge.confirmRetire)
                : t((m) => m.merge.confirmMerge)}
          </text>
          <text fg={colors.danger}>{t((m) => m.merge.cancel)}</text>
        </box>
      </Show>

      <Show when={props.preview.conflicts.length > 0}>
        <box flexDirection="column">
          <box flexDirection="row" gap={2}>
            <text fg="cyan" attributes={1}>
              [c]
            </text>
            <text>{t((m) => m.merge.checkoutOption)}</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text fg="cyan" attributes={1}>
              [p]
            </text>
            <text>{t((m) => m.merge.copyPrompt)(agentLabel(props.preview.program))}</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text fg={colors.muted}>[esc]</text>
            <text fg={colors.muted}>{t((m) => m.merge.closeHint)}</text>
          </box>
        </box>
      </Show>

      <Show when={props.preview.blocker}>
        <text fg={colors.muted}>{t((m) => m.merge.pressEsc)}</text>
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
