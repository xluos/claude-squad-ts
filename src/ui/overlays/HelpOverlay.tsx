import { useKeyboard } from '@opentui/solid';
import { For } from 'solid-js';
import { HELP_BINDINGS } from '../../shared/keymap.js';
import { colors } from '../../shared/styles.js';

export interface HelpOverlayProps {
  width: number;
  onClose: () => void;
}

export function HelpOverlay(props: HelpOverlayProps) {
  useKeyboard(() => props.onClose());

  return (
    <box
      flexDirection="column"
      borderStyle="double"
      borderColor={colors.primary}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      width={props.width}
      gap={0}
    >
      <text fg={colors.primary} attributes={1}>
        Help — press any key to close
      </text>
      <text> </text>
      <For each={HELP_BINDINGS}>
        {(b) => (
          <box flexDirection="row">
            <text fg="cyan" attributes={1}>
              {b.label}
            </text>
            <text> {b.desc}</text>
          </box>
        )}
      </For>
      <text fg={colors.muted}>Ctrl+Q during attach = detach</text>
    </box>
  );
}
