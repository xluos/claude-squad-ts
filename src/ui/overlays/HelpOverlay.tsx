import { useKeyboard } from '@opentui/solid';
import { For } from 'solid-js';
import { APP_NAME } from '../../shared/constants.js';
import { colors } from '../../shared/styles.js';

export interface HelpOverlayProps {
  width: number;
  onClose: () => void;
}

interface SectionDef {
  title: string;
  entries: [string, string][]; // [key, description]
}

// Mirrors the Go version's three-section layout (help.go helpTypeGeneral.toContent).
// Reflects our actual keymap (lowercase d/s, tmux prefix+d for detach, no
// terminal tab) rather than vanilla upstream.
const SECTIONS: SectionDef[] = [
  {
    title: 'Managing',
    entries: [
      ['n', 'Create a new session'],
      ['N', 'Create a new session with a prompt'],
      ['d', 'Kill (delete) the selected session'],
      ['↑/k, ↓/j', 'Navigate between sessions'],
      ['J / K', 'Reorder sessions down / up'],
      ['↵ / o', 'Attach to the selected session'],
      ['Ctrl+Q', 'Detach from an attached session (or tmux prefix + d)'],
    ],
  },
  {
    title: 'Handoff',
    entries: [
      ['s', 'Commit and push branch to GitHub'],
      ['c', 'Checkout: commit changes, pause session, copy branch to clipboard'],
      ['r', 'Resume a paused session'],
    ],
  },
  {
    title: 'Other',
    entries: [
      ['tab', 'Switch between Preview and Diff tabs'],
      ['shift+↑ / shift+↓', 'Scroll preview / diff (Esc to exit scroll)'],
      ['?', 'Show this help'],
      ['q / Ctrl+C', 'Quit the application'],
    ],
  },
];

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
      gap={1}
    >
      <box flexDirection="column">
        <text fg={colors.primary} attributes={3 /* BOLD | UNDERLINE */}>
          {APP_NAME}
        </text>
        <text fg={colors.muted}>
          Manage multiple Claude Code / aider sessions in isolated git worktrees.
        </text>
      </box>

      <For each={SECTIONS}>
        {(section) => (
          <box flexDirection="column">
            <text fg="cyan" attributes={1}>
              {section.title}:
            </text>
            <For each={section.entries}>
              {([key, desc]) => (
                <box flexDirection="row">
                  <text fg="yellow" attributes={1}>
                    {key.padEnd(18, ' ')}
                  </text>
                  <text fg="white">{desc}</text>
                </box>
              )}
            </For>
          </box>
        )}
      </For>

      <text fg={colors.muted}>Press any key to close.</text>
    </box>
  );
}
