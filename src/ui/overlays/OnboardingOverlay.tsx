import { useKeyboard } from '@opentui/solid';
import type { JSX } from 'solid-js';
import { Match, Switch } from 'solid-js';
import { t } from '../../shared/i18n.js';
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
      backgroundColor={colors.overlayBg}
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
            {t((m) => m.onboarding.attachTitle)}
          </text>
          <text>{t((m) => m.onboarding.attachBody)}</text>
          <box flexDirection="row">
            <text fg="cyan" attributes={1}>
              Ctrl+Q
            </text>
            <text fg={colors.muted}>{t((m) => m.onboarding.attachDetachHint)}</text>
          </box>
          <text fg={colors.muted}>{t((m) => m.onboarding.attachFooter)}</text>
        </Match>

        <Match when={props.kind === 'instance-start'}>
          <text fg={colors.primary} attributes={1}>
            {t((m) => m.onboarding.startedTitle)}
          </text>
          <box flexDirection="row">
            <text fg={colors.muted}>{t((m) => m.onboarding.branchLabel)}</text>
            <text fg="cyan" attributes={1}>
              {props.data?.branch ?? t((m) => m.merge.unknownBranch)}
            </text>
            <text fg={colors.muted}>{t((m) => m.onboarding.branchSuffix)}</text>
          </box>
          <box flexDirection="row">
            <text fg={colors.muted}>{t((m) => m.onboarding.programLabel)}</text>
            <text fg="cyan" attributes={1}>
              {props.data?.program ?? t((m) => m.merge.unknownBranch)}
            </text>
            <text fg={colors.muted}>{t((m) => m.onboarding.programSuffix)}</text>
          </box>
          <text> </text>
          <box flexDirection="row">
            <text fg="cyan" attributes={1}>
              ↵/o
            </text>
            <text> {t((m) => m.onboarding.startedAttach)} · </text>
            <text fg="cyan" attributes={1}>
              tab
            </text>
            <text> {t((m) => m.onboarding.startedSwitchTab)} · </text>
            <text fg="cyan" attributes={1}>
              c
            </text>
            <text> {t((m) => m.onboarding.startedCheckout)} · </text>
            <text fg="cyan" attributes={1}>
              s
            </text>
            <text> {t((m) => m.onboarding.startedPush)} · </text>
            <text fg="cyan" attributes={1}>
              d
            </text>
            <text> {t((m) => m.onboarding.startedKill)}</text>
          </box>
          <text fg={colors.muted}>{t((m) => m.onboarding.startedFooter)}</text>
        </Match>

        <Match when={props.kind === 'checkout'}>
          <text fg={colors.primary} attributes={1}>
            {t((m) => m.onboarding.checkoutTitle)}
          </text>
          <text>{t((m) => m.onboarding.checkoutLine1)}</text>
          <text>{t((m) => m.onboarding.checkoutLine2)}</text>
          <text>{t((m) => m.onboarding.checkoutLine3)}</text>
          <box flexDirection="row">
            <text fg="cyan" attributes={1}>
              r
            </text>
            <text> {t((m) => m.onboarding.checkoutResumeHint)}</text>
          </box>
          <text fg={colors.muted}>{t((m) => m.onboarding.checkoutFooter)}</text>
        </Match>
      </Switch>
    </box>
  );
}
