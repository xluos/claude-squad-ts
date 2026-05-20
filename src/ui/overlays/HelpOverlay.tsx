import { useKeyboard } from '@opentui/solid';
import { For } from 'solid-js';
import { APP_NAME } from '../../shared/constants.js';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';

export interface HelpOverlayProps {
  width: number;
  onClose: () => void;
}

interface SectionDef {
  title: () => string;
  /** Each entry: [key column (raw, no i18n), () => translated description]. */
  entries: [string, () => string][];
}

// Mirrors the Go version's three-section layout. Section titles and entry
// descriptions read from i18n so the help panel switches languages along
// with the rest of the UI.
const SECTIONS: SectionDef[] = [
  {
    title: () => t((m) => m.help.sections.managing),
    entries: [
      ['n', () => t((m) => m.help.entries.new)],
      ['N', () => t((m) => m.help.entries.newWithPrompt)],
      ['d', () => t((m) => m.help.entries.kill)],
      ['↑/k, ↓/j', () => t((m) => m.help.entries.nav)],
      ['J / K', () => t((m) => m.help.entries.reorder)],
      ['↵ / o', () => t((m) => m.help.entries.attach)],
      ['Ctrl+Q', () => t((m) => m.help.entries.detach)],
      ['i', () => t((m) => m.help.entries.send)],
    ],
  },
  {
    title: () => t((m) => m.help.sections.handoff),
    entries: [
      ['s', () => t((m) => m.help.entries.push)],
      ['c', () => t((m) => m.help.entries.checkout)],
      ['r', () => t((m) => m.help.entries.resume)],
      ['m', () => t((m) => m.help.entries.merge)],
      ['M', () => t((m) => m.help.entries.mergeRetire)],
      ['u', () => t((m) => m.help.entries.sync)],
    ],
  },
  {
    title: () => t((m) => m.help.sections.other),
    entries: [
      ['tab', () => t((m) => m.help.entries.switchTab)],
      ['shift+↑ / shift+↓', () => t((m) => m.help.entries.scroll)],
      ['?', () => t((m) => m.help.entries.help)],
      ['q / Ctrl+C', () => t((m) => m.help.entries.quit)],
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
      backgroundColor={colors.overlayBg}
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
        <text fg={colors.muted}>{t((m) => m.help.subtitle)}</text>
      </box>

      <For each={SECTIONS}>
        {(section) => (
          <box flexDirection="column">
            <text fg="cyan" attributes={1}>
              {`${section.title()}:`}
            </text>
            <For each={section.entries}>
              {([key, desc]) => (
                <box flexDirection="row">
                  <text fg="yellow" attributes={1}>
                    {key.padEnd(18, ' ')}
                  </text>
                  <text fg="white">{desc()}</text>
                </box>
              )}
            </For>
          </box>
        )}
      </For>

      <text fg={colors.muted}>{t((m) => m.help.pressAnyKey)}</text>
    </box>
  );
}
