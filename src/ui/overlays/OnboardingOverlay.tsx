import { useKeyboard } from '@opentui/solid';
import type { JSX } from 'solid-js';
import { Match, Switch } from 'solid-js';
import { colors } from '../../shared/styles.js';

export type OnboardingKind = 'attach' | 'instance-start' | 'checkout';

export interface OnboardingOverlayProps {
  kind: OnboardingKind;
  /** Optional metadata for kinds that show contextual info. */
  data?: { branch?: string; program?: string };
  width: number;
  onDismiss: () => void;
}

export function OnboardingOverlay(props: OnboardingOverlayProps): JSX.Element {
  useKeyboard(() => props.onDismiss());

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
      <Switch>
        <Match when={props.kind === 'attach'}>
          <text fg={colors.primary} attributes={1}>
            Attaching to session
          </text>
          <text>The session runs inside tmux. To return to claude-squad:</text>
          <box flexDirection="row">
            <text fg="cyan" attributes={1}>
              Ctrl+Q
            </text>
            <text fg={colors.muted}> — or the native tmux prefix + d (default Ctrl+B d)</text>
          </box>
          <text fg={colors.muted}>Press any key to attach.</text>
        </Match>

        <Match when={props.kind === 'instance-start'}>
          <text fg={colors.primary} attributes={1}>
            Session created
          </text>
          <box flexDirection="row">
            <text fg={colors.muted}>branch: </text>
            <text fg="cyan" attributes={1}>
              {props.data?.branch ?? '(unknown)'}
            </text>
            <text fg={colors.muted}> (in an isolated git worktree)</text>
          </box>
          <box flexDirection="row">
            <text fg={colors.muted}>program: </text>
            <text fg="cyan" attributes={1}>
              {props.data?.program ?? '(unknown)'}
            </text>
            <text fg={colors.muted}> (running in background tmux)</text>
          </box>
          <text> </text>
          <box flexDirection="row">
            <text fg="cyan" attributes={1}>
              ↵/o
            </text>
            <text> attach · </text>
            <text fg="cyan" attributes={1}>
              tab
            </text>
            <text> switch tab · </text>
            <text fg="cyan" attributes={1}>
              c
            </text>
            <text> checkout · </text>
            <text fg="cyan" attributes={1}>
              s
            </text>
            <text> push · </text>
            <text fg="cyan" attributes={1}>
              d
            </text>
            <text> kill</text>
          </box>
          <text fg={colors.muted}>Press any key to continue.</text>
        </Match>

        <Match when={props.kind === 'checkout'}>
          <text fg={colors.primary} attributes={1}>
            Checkout session
          </text>
          <text>Changes will be auto-committed locally and the worktree removed.</text>
          <text>The branch is preserved and its name is copied to your clipboard,</text>
          <text>so you can `git checkout` it from any other repo.</text>
          <box flexDirection="row">
            <text fg="cyan" attributes={1}>
              r
            </text>
            <text> resumes the session later.</text>
          </box>
          <text fg={colors.muted}>Press any key to confirm.</text>
        </Match>
      </Switch>
    </box>
  );
}
