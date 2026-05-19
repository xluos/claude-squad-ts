import { For, type JSX } from 'solid-js';
import { colors } from '../../shared/styles.js';

export type TabId = 'preview' | 'diff';

const TABS: { id: TabId; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'diff', label: 'Diff' },
];

export interface TabbedWindowProps {
  active: TabId;
  children: JSX.Element;
}

export function TabbedWindow(props: TabbedWindowProps) {
  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection="row">
        <For each={TABS}>
          {(t) => (
            <box flexGrow={1} justifyContent="center" flexDirection="row">
              <text
                fg={props.active === t.id ? colors.tabActive : colors.tabInactive}
                attributes={props.active === t.id ? 1 : 0}
              >
                {props.active === t.id ? `[${t.label}]` : ` ${t.label} `}
              </text>
            </box>
          )}
        </For>
      </box>
      <box flexGrow={1} flexDirection="column">
        {props.children}
      </box>
    </box>
  );
}

export function nextTab(id: TabId): TabId {
  return id === 'preview' ? 'diff' : 'preview';
}
