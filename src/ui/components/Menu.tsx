import { createEffect, createSignal, For, on, onCleanup } from 'solid-js';
import { MENU_KEY_HIGHLIGHT_MS } from '../../shared/constants.js';
import {
  DEFAULT_BINDINGS,
  type KeyBinding,
  NEW_INSTANCE_BINDINGS,
  PROMPT_BINDINGS,
} from '../../shared/keymap.js';
import { colors } from '../../shared/styles.js';

export type MenuMode = 'default' | 'empty' | 'new' | 'prompt';

export interface MenuProps {
  mode: MenuMode;
  pressedKey: string | null;
}

export function Menu(props: MenuProps) {
  const [highlight, setHighlight] = createSignal<string | null>(null);

  // Whenever pressedKey changes, briefly highlight that binding then clear.
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
      default:
        return DEFAULT_BINDINGS;
    }
  };

  return (
    <box paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="center" gap={2}>
      <For each={bindings()}>
        {(b, i) => (
          <box flexDirection="row">
            {i() > 0 && <text fg={colors.muted}>· </text>}
            <text fg={highlight() === b.key ? colors.accent : colors.primary} attributes={1}>
              {b.label}
            </text>
            <text fg={highlight() === b.key ? colors.accent : 'white'}> {b.desc}</text>
          </box>
        )}
      </For>
    </box>
  );
}
