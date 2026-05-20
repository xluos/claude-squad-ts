import { createEffect, createSignal, For, on, onCleanup } from 'solid-js';
import { MENU_KEY_HIGHLIGHT_MS } from '../../shared/constants.js';
import {
  DEFAULT_BINDINGS,
  type KeyBinding,
  NEW_INSTANCE_BINDINGS,
  PAUSED_BINDINGS,
  PROMPT_BINDINGS,
} from '../../shared/keymap.js';
import { colors } from '../../shared/styles.js';

export type MenuMode = 'default' | 'empty' | 'new' | 'prompt' | 'paused';

export interface MenuProps {
  mode: MenuMode;
  pressedKey: string | null;
}

export function Menu(props: MenuProps) {
  const [highlight, setHighlight] = createSignal<string | null>(null);

  createEffect(
    on(
      () => props.pressedKey,
      (key) => {
        if (!key) return;
        setHighlight(key);
        const id = setTimeout(() => setHighlight(null), MENU_KEY_HIGHLIGHT_MS);
        onCleanup(() => clearTimeout(id));
      },
    ),
  );

  const bindings = (): KeyBinding[] => {
    switch (props.mode) {
      case 'new':
        return NEW_INSTANCE_BINDINGS;
      case 'prompt':
        return PROMPT_BINDINGS;
      case 'paused':
        return PAUSED_BINDINGS;
      default:
        return DEFAULT_BINDINGS;
    }
  };

  return (
    <box paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="center" gap={0}>
      <For each={bindings()}>
        {(b, i) => {
          const prev = () => bindings()[i() - 1];
          const sep = () => {
            if (i() === 0) return null;
            // Different group → visible `·` divider. Same group → a thin
            // gap so the cluster still reads as separate words without
            // looking sprawled.
            return prev()?.group !== b.group ? ' · ' : '  ';
          };
          const active = () => highlight() === b.key;
          const keyColor = () => (active() ? colors.accent : colors.primary);
          const descColor = () => (active() ? colors.accent : 'white');
          return (
            <box flexDirection="row">
              {sep() ? <text fg={colors.muted}>{sep()}</text> : null}
              <text fg={keyColor()} attributes={1}>
                {b.label}
              </text>
              <text fg={descColor()}> {b.desc()}</text>
            </box>
          );
        }}
      </For>
    </box>
  );
}
