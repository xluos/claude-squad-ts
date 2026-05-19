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
  Submit: 'p',
  Kill: 'D',
  Help: '?',
  Quit: 'q',
} as const;
export type KeyName = (typeof KeyName)[keyof typeof KeyName];

export interface KeyBinding {
  key: KeyName;
  label: string;
  desc: string;
}

export const DEFAULT_BINDINGS: KeyBinding[] = [
  { key: KeyName.New, label: 'n', desc: 'new' },
  { key: KeyName.Prompt, label: 'N', desc: 'new with prompt' },
  { key: KeyName.Enter, label: '↵', desc: 'attach' },
  { key: KeyName.Tab, label: '⇥', desc: 'next tab' },
  { key: KeyName.Submit, label: 'p', desc: 'push' },
  { key: KeyName.Checkout, label: 'c', desc: 'pause' },
  { key: KeyName.Resume, label: 'r', desc: 'resume' },
  { key: KeyName.Kill, label: 'D', desc: 'kill' },
  { key: KeyName.Help, label: '?', desc: 'help' },
  { key: KeyName.Quit, label: 'q', desc: 'quit' },
];

export const NEW_INSTANCE_BINDINGS: KeyBinding[] = [
  { key: KeyName.Enter, label: '↵', desc: 'start' },
];

export const PROMPT_BINDINGS: KeyBinding[] = [{ key: KeyName.Enter, label: '↵', desc: 'submit' }];
