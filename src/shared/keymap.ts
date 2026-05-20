import { t } from './i18n.js';

export const KeyName = {
  Up: 'up',
  Down: 'down',
  ShiftUp: 'shift+up',
  ShiftDown: 'shift+down',
  MoveUp: 'K',
  MoveDown: 'J',
  New: 'n',
  Prompt: 'N',
  Enter: 'enter',
  Tab: 'tab',
  Checkout: 'c',
  Resume: 'r',
  Submit: 's',
  Merge: 'm',
  Kill: 'd',
  Help: '?',
  Quit: 'q',
  Cancel: 'esc',
} as const;
export type KeyName = (typeof KeyName)[keyof typeof KeyName];

export interface KeyBinding {
  key: KeyName;
  label: string;
  /** Late-bound so each render picks up the current i18n language. */
  desc: () => string;
  /**
   * Logical cluster for the bottom menu bar. The Menu component packs
   * same-group entries tightly and inserts a `·` separator only between
   * different groups. Omit on bindings that don't need grouping.
   */
  group?: number;
}

// Bottom menu bar. Three clusters separated by `·`:
//   1) instance actions, 2) branch actions, 3) misc UI controls.
export const DEFAULT_BINDINGS: KeyBinding[] = [
  { key: KeyName.New, label: 'n', desc: () => t((m) => m.menu.new), group: 1 },
  { key: KeyName.Kill, label: 'd', desc: () => t((m) => m.menu.kill), group: 1 },
  { key: KeyName.Enter, label: '↵/o', desc: () => t((m) => m.menu.open), group: 1 },
  { key: KeyName.Submit, label: 's', desc: () => t((m) => m.menu.submitPR), group: 2 },
  { key: KeyName.Checkout, label: 'c', desc: () => t((m) => m.menu.checkout), group: 2 },
  { key: KeyName.Merge, label: 'm', desc: () => t((m) => m.menu.merge), group: 2 },
  { key: KeyName.Tab, label: 'tab', desc: () => t((m) => m.menu.switchTab), group: 3 },
  { key: KeyName.Quit, label: 'q', desc: () => t((m) => m.menu.quit), group: 3 },
  { key: KeyName.Help, label: '?', desc: () => t((m) => m.menu.help), group: 3 },
];

// Variant of DEFAULT_BINDINGS shown when the selected instance is paused
// (worktree removed). `↵/o open` is gone because attach is blocked in
// that state, and `c checkout` becomes `r resume` since the action you'd
// want is bringing the worktree back rather than tearing it down again.
export const PAUSED_BINDINGS: KeyBinding[] = [
  { key: KeyName.New, label: 'n', desc: () => t((m) => m.menu.new), group: 1 },
  { key: KeyName.Kill, label: 'd', desc: () => t((m) => m.menu.kill), group: 1 },
  { key: KeyName.Resume, label: 'r', desc: () => t((m) => m.menu.resume), group: 1 },
  { key: KeyName.Submit, label: 's', desc: () => t((m) => m.menu.submitPR), group: 2 },
  { key: KeyName.Merge, label: 'm', desc: () => t((m) => m.menu.merge), group: 2 },
  { key: KeyName.Tab, label: 'tab', desc: () => t((m) => m.menu.switchTab), group: 3 },
  { key: KeyName.Quit, label: 'q', desc: () => t((m) => m.menu.quit), group: 3 },
  { key: KeyName.Help, label: '?', desc: () => t((m) => m.menu.help), group: 3 },
];

export const NEW_INSTANCE_BINDINGS: KeyBinding[] = [
  { key: KeyName.Enter, label: '↵', desc: () => t((m) => m.menu.start) },
  { key: KeyName.Cancel, label: 'esc', desc: () => t((m) => m.menu.cancel) },
];

export const PROMPT_BINDINGS: KeyBinding[] = [
  { key: KeyName.Enter, label: '↵', desc: () => t((m) => m.menu.submit) },
  { key: KeyName.Cancel, label: 'esc', desc: () => t((m) => m.menu.cancel) },
];

// Full help screen's content lives in src/ui/overlays/HelpOverlay.tsx
// (sections + descriptions). A KeyBinding[] mirror used to live here but
// nothing imported it — keeping two sources of truth invariably drifted,
// so the help overlay is the only authoritative version.
