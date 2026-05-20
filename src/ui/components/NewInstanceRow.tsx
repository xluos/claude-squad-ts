import { defaultTextareaKeyBindings, type TextareaRenderable } from '@opentui/core';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';

/** Same Enter-submits keymap as the bottom prompt input. */
const SUBMIT_ON_ENTER_BINDINGS = [
  { name: 'return', shift: true, action: 'newline' as const },
  { name: 'kpenter', shift: true, action: 'newline' as const },
  { name: 'return', action: 'submit' as const },
  { name: 'kpenter', action: 'submit' as const },
  { name: 'linefeed', action: 'submit' as const },
  ...defaultTextareaKeyBindings.filter(
    (b) => !(b.name === 'return' || b.name === 'kpenter' || b.name === 'linefeed'),
  ),
];

export interface NewInstanceRowProps {
  /** Row number shown in front of the textarea, e.g. "3.". */
  index: number;
  /** Hint shown when the textarea is empty. */
  placeholder: string;
  /** Caller-provided ref setter so it can drive focus / read plainText. */
  textareaRef: (r: TextareaRenderable) => void;
  onContentChange: () => void;
  onSubmit: () => void;
  onKeyDown: (e: { name: string; preventDefault(): void }) => void;
}

/**
 * Inline "new instance" placeholder rendered at the bottom of the instance
 * list while the user is naming a session. Matches the Go reference's
 * mental model: a temporary, unstarted row whose title field accepts input
 * in place — instead of forcing the user to type into a distant prompt
 * at the other side of the screen.
 */
export function NewInstanceRow(props: NewInstanceRowProps) {
  return (
    <box flexDirection="column" marginTop={1}>
      <box flexDirection="row">
        <text fg={colors.muted}>{`${props.index}. `}</text>
        <textarea
          flexGrow={1}
          ref={props.textareaRef}
          placeholder={props.placeholder}
          placeholderColor={colors.muted}
          focusedTextColor={colors.accent}
          textColor={colors.accent}
          focused={true}
          keyBindings={SUBMIT_ON_ENTER_BINDINGS}
          onContentChange={props.onContentChange}
          onSubmit={props.onSubmit}
          onKeyDown={props.onKeyDown}
        />
        <text fg={colors.statusLoading}> ◐</text>
      </box>
      <text fg={colors.muted}>{`   λ-${t((m) => m.list.willBeCreated)}`}</text>
    </box>
  );
}
