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
  Kill: 'd',
  Help: '?',
  Quit: 'q',
} as const;
export type KeyName = (typeof KeyName)[keyof typeof KeyName];

export interface KeyBinding {
  key: KeyName;
  label: string;
  desc: string;
}

// Bottom menu bar (separator-joined). Ordering matches the original UI:
// n new · d kill · ↵/o open · s submit PR · c checkout · tab switch tab · q quit
export const DEFAULT_BINDINGS: KeyBinding[] = [
  { key: KeyName.New, label: 'n', desc: 'new' },
  { key: KeyName.Kill, label: 'd', desc: 'kill' },
  { key: KeyName.Enter, label: '↵/o', desc: 'open' },
  { key: KeyName.Submit, label: 's', desc: 'submit PR' },
  { key: KeyName.Checkout, label: 'c', desc: 'checkout' },
  { key: KeyName.Tab, label: 'tab', desc: 'switch tab' },
  { key: KeyName.Quit, label: 'q', desc: 'quit' },
];

export const NEW_INSTANCE_BINDINGS: KeyBinding[] = [
  { key: KeyName.Enter, label: '↵', desc: 'start' },
];

export const PROMPT_BINDINGS: KeyBinding[] = [{ key: KeyName.Enter, label: '↵', desc: 'submit' }];

// Full help screen — superset of default plus secondary bindings.
export const HELP_BINDINGS: KeyBinding[] = [
  ...DEFAULT_BINDINGS,
  { key: KeyName.Prompt, label: 'N', desc: 'new with prompt' },
  { key: KeyName.Resume, label: 'r', desc: 'resume paused' },
  { key: KeyName.MoveUp, label: 'K', desc: 'reorder up' },
  { key: KeyName.MoveDown, label: 'J', desc: 'reorder down' },
  { key: KeyName.ShiftUp, label: 'shift+↑', desc: 'scroll preview/diff' },
  { key: KeyName.ShiftDown, label: 'shift+↓', desc: 'scroll preview/diff' },
];
