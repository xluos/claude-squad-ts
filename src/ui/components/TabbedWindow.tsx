import { TextAttributes } from '@opentui/core';
import { For, type JSX, Show } from 'solid-js';
import stringWidth from 'string-width';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';
import type { DiffStats } from '../../shared/types.js';

export type TabId = 'preview' | 'diff';

/** Tab labels are evaluated per-render so the active language wins. Stored
 *  as `() => string` because i18n itself doesn't hot-swap, but the same
 *  shape would survive a future hot-swap without code changes. */
const TABS: { id: TabId; label: () => string }[] = [
  { id: 'preview', label: () => t((m) => m.tabs.preview) },
  { id: 'diff', label: () => t((m) => m.tabs.diff) },
];

export interface TabbedWindowProps {
  active: TabId;
  /** Optional hint shown on the right side of the tab strip. */
  hint?: string;
  /** Diff stats for the currently selected instance. Rendered as
   *  `+N -M` to the left of the hint — hidden when both sides are 0,
   *  so a clean tree leaves the slot empty. */
  diffStats?: DiffStats;
  /** Branch the selected instance's worktree was forked from — shown
   *  immediately left of `diffStats` as the "based on …" label. Same
   *  visibility gating as diffStats: only when there's a non-zero diff
   *  and a branch name is known. */
  baseBranch?: string;
  /** Click handler on a tab label or its underline indicator. */
  onTabClick?: (id: TabId) => void;
  children: JSX.Element;
}

/**
 * Flat-underline tab strip. Active tab = bright + bold + `━━━` indicator;
 * inactive tab = muted text only. Distinct from the `Instances` chip on
 * the left, which is a solid bg block. The shape language:
 *   - solid bg block  → static section label
 *   - text + underline → switchable tab
 *
 * Two rows tall (labels row + indicator row), then the bordered content
 * area below. The InstanceList border on the left starts at the same row
 * as the content border on the right, so the two panels are vertically
 * aligned.
 */
export function TabbedWindow(props: TabbedWindowProps) {
  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection="row" gap={2}>
        <For each={TABS}>
          {(tab) => {
            const active = () => props.active === tab.id;
            return (
              <text
                fg={active() ? colors.tabActive : colors.tabInactive}
                attributes={active() ? 1 : 0}
                onMouseDown={() => props.onTabClick?.(tab.id)}
              >
                {tab.label()}
              </text>
            );
          }}
        </For>
        {/* Hint sits immediately right of the tab labels — it explains how
         *  to operate them, so it belongs next to them, not on the far
         *  right. Base branch + diff stats describe the right pane's
         *  content (what we're diffing against, how big the diff is) and
         *  get pushed all the way out to the right edge by the spacer.
         *
         *  Parentheses + DIM attribute knock the hint down a tier so it
         *  reads as auxiliary metadata, not a third tab label —
         *  terminals don't have sub-cell font sizing, so visual hierarchy
         *  comes from punctuation + dim intensity instead. */}
        <Show when={props.hint}>
          <text fg={colors.muted} attributes={TextAttributes.DIM}>
            {`(${props.hint})`}
          </text>
        </Show>
        <box flexGrow={1} />
        <Show when={props.diffStats && (props.diffStats.added > 0 || props.diffStats.removed > 0)}>
          <box flexDirection="row" gap={1}>
            <Show when={props.baseBranch}>
              <text fg={colors.muted}>{` ${props.baseBranch}`}</text>
            </Show>
            <text fg={colors.diffAdded}>{`+${props.diffStats?.added ?? 0}`}</text>
            <text fg={colors.diffRemoved}>{`-${props.diffStats?.removed ?? 0}`}</text>
          </box>
        </Show>
      </box>
      <box flexDirection="row" gap={2}>
        <For each={TABS}>
          {(tab) => {
            const active = () => props.active === tab.id;
            // Use display width (CJK = 2 cells) not code-point count, so the
            // underline matches the label and the gap between tabs stays aligned.
            const width = () => stringWidth(tab.label());
            return (
              <text
                fg={active() ? colors.primary : colors.muted}
                onMouseDown={() => props.onTabClick?.(tab.id)}
              >
                {(active() ? '━' : ' ').repeat(width())}
              </text>
            );
          }}
        </For>
      </box>
      <box
        flexGrow={1}
        flexDirection="column"
        borderStyle="rounded"
        borderColor={colors.borderActive}
        paddingLeft={1}
        paddingRight={1}
      >
        {props.children}
      </box>
    </box>
  );
}

export function nextTab(id: TabId): TabId {
  return id === 'preview' ? 'diff' : 'preview';
}
