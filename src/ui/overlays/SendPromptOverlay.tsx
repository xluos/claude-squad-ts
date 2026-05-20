import { defaultTextareaKeyBindings, type TextareaRenderable } from '@opentui/core';
import { onMount } from 'solid-js';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';

/** Same Enter-submits / Shift-Enter-newline keymap used by the inline prompt
 *  flows. Duplicated here on purpose — both inline pre-existing callsites
 *  (NewInstanceRow, App.tsx) already keep their own copy, so a fourth
 *  shared module would only matter when the next callsite shows up. */
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

export interface SendPromptOverlayProps {
  /** Session being sent to — shown in the header so the user can tell which
   *  pane is about to receive the input when several are running. */
  targetName: string;
  width: number;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Modal overlay that captures a one-shot prompt and forwards it to the
 * selected session's tmux pane via `send-keys`. Lives in the overlay tree
 * instead of as a footer inside Preview so the main panes' layout doesn't
 * shift when the input opens — opening a modal feels like a separate beat,
 * a layout reflow feels like the page glitched.
 */
export function SendPromptOverlay(props: SendPromptOverlayProps) {
  let ref: TextareaRenderable | undefined;

  onMount(() => {
    // The opener already deferred state mutation past the triggering key;
    // by the time we mount the textarea is safe to focus without eating
    // the original `i` keypress.
    ref?.focus();
  });

  function handleSubmit(): void {
    // Double setTimeout mirrors the bottom-input flow: lets an in-flight
    // IME composition flush its trailing character into plainText before
    // we read it. Without this, the last pinyin char on submit-by-Enter
    // can be dropped.
    setTimeout(() => {
      setTimeout(() => {
        const text = ref?.plainText ?? '';
        props.onSubmit(text);
      }, 0);
    }, 0);
  }

  function handleKey(e: { name: string; preventDefault(): void }): void {
    if (e.name === 'escape') {
      e.preventDefault();
      props.onCancel();
    }
  }

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={colors.borderActive}
      backgroundColor={colors.overlayBg}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      width={props.width}
    >
      <box flexDirection="row" gap={1}>
        <text fg={colors.muted}>{t((m) => m.sendPrompt.header)}</text>
        <text fg={colors.accent} attributes={1}>
          {props.targetName}
        </text>
      </box>
      <box flexDirection="row" paddingTop={1}>
        <text fg="cyan" attributes={1}>
          {'> '}
        </text>
        <textarea
          flexGrow={1}
          ref={(r) => {
            ref = r;
          }}
          placeholder={t((m) => m.sendPrompt.placeholder)}
          placeholderColor={colors.muted}
          focusedTextColor="white"
          textColor="white"
          focused={true}
          keyBindings={SUBMIT_ON_ENTER_BINDINGS}
          onSubmit={handleSubmit}
          onKeyDown={handleKey}
        />
      </box>
      <text fg={colors.muted}>{t((m) => m.sendPrompt.hint)}</text>
    </box>
  );
}
