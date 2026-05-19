import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';
import { MENU_KEY_HIGHLIGHT_MS } from '../../shared/constants.js';
import {
  DEFAULT_BINDINGS,
  type KeyBinding,
  NEW_INSTANCE_BINDINGS,
  PROMPT_BINDINGS,
} from '../../shared/keymap.js';

export type MenuMode = 'default' | 'empty' | 'new' | 'prompt';

export interface MenuProps {
  mode: MenuMode;
  pressedKey?: string | null;
}

export function Menu({ mode, pressedKey }: MenuProps): React.ReactElement {
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!pressedKey) return;
    setHighlight(pressedKey);
    const id = setTimeout(() => setHighlight(null), MENU_KEY_HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [pressedKey]);

  const bindings = bindingsFor(mode);

  return (
    <Box paddingX={1}>
      {bindings.map((b, i) => (
        <React.Fragment key={b.key}>
          {i > 0 && <Text color="gray"> </Text>}
          <Text>
            <Text color={highlight === b.key ? 'yellow' : 'cyan'} bold>
              {`[${b.label}]`}
            </Text>
            <Text color={highlight === b.key ? 'yellow' : 'white'}> {b.desc}</Text>
          </Text>
        </React.Fragment>
      ))}
    </Box>
  );
}

function bindingsFor(mode: MenuMode): KeyBinding[] {
  switch (mode) {
    case 'new':
      return NEW_INSTANCE_BINDINGS;
    case 'prompt':
      return PROMPT_BINDINGS;
    case 'empty':
    case 'default':
    default:
      return DEFAULT_BINDINGS;
  }
}
