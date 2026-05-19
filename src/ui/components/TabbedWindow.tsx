import { For, type JSX, Show } from 'solid-js';
import { colors } from '../../shared/styles.js';

export type TabId = 'preview' | 'diff';

const TABS: { id: TabId; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'diff', label: 'Diff' },
];

export interface TabbedWindowProps {
  active: TabId;
  /** Optional hint shown on the right side of the tab strip. */
  hint?: string;
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
          {(t) => {
            const active = () => props.active === t.id;
            return (
              <text
                fg={active() ? colors.tabActive : colors.tabInactive}
                attributes={active() ? 1 : 0}
              >
                {t.label}
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
          {(t) => {
            const active = () => props.active === t.id;
            return (
              <text fg={active() ? colors.primary : colors.muted}>
                {active() ? '━'.repeat(t.label.length) : ' '.repeat(t.label.length)}
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
