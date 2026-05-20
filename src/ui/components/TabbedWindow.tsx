import { For, type JSX, Show } from 'solid-js';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';

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
        <box flexGrow={1} />
        <Show when={props.hint}>
          <text fg={colors.muted}>{props.hint}</text>
        </Show>
      </box>
      <box flexDirection="row" gap={2}>
        <For each={TABS}>
          {(tab) => {
            const active = () => props.active === tab.id;
            return (
              <text
                fg={active() ? colors.primary : colors.muted}
                onMouseDown={() => props.onTabClick?.(tab.id)}
              >
                {active() ? '━'.repeat(tab.label().length) : ' '.repeat(tab.label().length)}
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
