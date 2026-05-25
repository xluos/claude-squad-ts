import type { RGBA } from '@opentui/core';
import type { JSX } from 'solid-js';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { t } from '../../shared/i18n.js';
import { colors, icons } from '../../shared/styles.js';
import type { GitStatus } from '../../shared/types.js';
import { Status } from '../../shared/types.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

export interface InstanceListProps {
  instances: Instance[];
  selectedIndex: number;
  width: number;
  height: number;
  autoYes?: boolean;
  /** Mutation revision counter; pass through so Rows re-evaluate when an
   *  instance's internal class state changes (status, diff stats, ...). */
  rev: number;
  /** Optional inline placeholder rendered after the last persisted row,
   *  used by the "new session" flow so the user types the name where the
   *  row will actually live. */
  newInstanceRow?: JSX.Element;
  /** Click handler: receives the 0-based index of the row the user pressed. */
  onSelect?: (index: number) => void;
}

export function InstanceList(props: InstanceListProps) {
  return (
    <box flexDirection="column" width={props.width} height={props.height}>
      {/* Top label row — sits on the same line as the right column's
       *  `Preview Diff` tab labels. The blank line below this chip mirrors
       *  the ━ underline row of the TabbedWindow, so both the labels and
       *  the border tops line up across the two panels. */}
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
        <text bg={colors.primary} fg="white" attributes={1}>
          {t((m) => m.list.instancesChip)}
        </text>
        <Show when={props.autoYes}>
          <text bg={colors.warning} fg="black" attributes={1}>
            {t((m) => m.list.autoYesChip)}
          </text>
        </Show>
      </box>
      <text> </text>
      <box
        flexGrow={1}
        flexDirection="column"
        width={props.width}
        borderStyle="rounded"
        borderColor={colors.borderActive}
        paddingLeft={1}
        paddingRight={1}
        gap={1}
      >
        <Show
          when={props.instances.length > 0}
          fallback={
            <box paddingTop={1} flexDirection="column" gap={0}>
              <text fg={colors.muted}>{t((m) => m.list.noSessions)}</text>
              <text> </text>
              <box flexDirection="row">
                <text fg="cyan">n</text>
                <text fg={colors.muted}> {t((m) => m.list.hintName)}</text>
              </box>
              <box flexDirection="row">
                <text fg="cyan">N</text>
                <text fg={colors.muted}> {t((m) => m.list.hintPrompt)}</text>
              </box>
              <box flexDirection="row">
                <text fg="cyan">?</text>
                <text fg={colors.muted}> {t((m) => m.list.hintHelp)}</text>
              </box>
            </box>
          }
        >
          <For each={props.instances}>
            {(inst, idx) => (
              <Row
                instance={inst}
                selected={idx() === props.selectedIndex}
                rev={props.rev}
                onClick={() => props.onSelect?.(idx())}
              />
            )}
          </For>
        </Show>
        {/* New-instance placeholder, rendered after persisted rows so the
            input visually lives where the row will be. */}
        <Show when={props.newInstanceRow}>{props.newInstanceRow}</Show>
      </box>
    </box>
  );
}

interface RowProps {
  instance: Instance;
  selected: boolean;
  rev: number;
  onClick?: () => void;
}

function Row(props: RowProps) {
  // Every derived value reads `props.rev` first so it re-evaluates when the
  // app-level revision counter bumps. Without this, mutations to the class
  // instance's fields (status, diffStats) wouldn't reach the view.
  const displayName = () => {
    void props.rev;
    return props.instance.displayName || props.instance.title;
  };
  const branch = () => {
    void props.rev;
    return props.instance.branch || '(pending)';
  };
  const gitStatus = () => {
    void props.rev;
    return props.instance.gitStatus;
  };
  const commits = () => {
    void props.rev;
    return props.instance.commitStats;
  };
  // Pre-assemble the bracket segments so we can hide the wrapper entirely
  // when everything is zero. Mirrors starship's `[git_status]` shape:
  //   ~modified  ?untracked  +staged  ✘deleted  »renamed  ✖conflict  ↑ahead  ↓behind
  // Conflicts and `behind` use the danger hue; ahead uses success/blue;
  // everything else is the muted-yellow "look here" tone, matching the
  // user's starship theme. The whole bracket collapses when synced & clean.
  const statusSegments = (): { text: string; fg: RGBA | string }[] => {
    const g: GitStatus = gitStatus();
    const c = commits();
    const out: { text: string; fg: RGBA | string }[] = [];
    if (g.modified > 0) out.push({ text: `~${g.modified}`, fg: colors.warning });
    if (g.untracked > 0) out.push({ text: `?${g.untracked}`, fg: colors.warning });
    if (g.staged > 0) out.push({ text: `+${g.staged}`, fg: colors.warning });
    if (g.deleted > 0) out.push({ text: `✘${g.deleted}`, fg: colors.diffRemoved });
    if (g.renamed > 0) out.push({ text: `»${g.renamed}`, fg: colors.warning });
    if (g.conflicted > 0) out.push({ text: `✖${g.conflicted}`, fg: colors.diffRemoved });
    if (c.ahead > 0) out.push({ text: `↑${c.ahead}`, fg: colors.success });
    if (c.behind > 0) out.push({ text: `↓${c.behind}`, fg: colors.commitBehind });
    return out;
  };
  const status = () => {
    void props.rev;
    return props.instance.status;
  };
  const busy = () => {
    void props.rev;
    return props.instance.busy;
  };
  const [spinnerIdx, setSpinnerIdx] = createSignal(0);
  const spinTimer = setInterval(
    () => setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length),
    SPINNER_INTERVAL_MS,
  );
  onCleanup(() => clearInterval(spinTimer));
  // Mirror the Go reference: selected rows use a light-blue-grey background
  // (#dde4f0) with dark text for contrast. Padding-X gives the band of
  // colour breathing room from the outer border instead of butting against
  // it like before.
  const bg = () => (props.selected ? colors.selectedBg : undefined);
  const titleFg = () => (props.selected ? colors.selectedFg : 'white');
  const branchFg = () => (props.selected ? colors.selectedBranch : colors.muted);

  return (
    <box
      flexDirection="column"
      backgroundColor={bg()}
      paddingLeft={1}
      paddingRight={1}
      onMouseDown={() => props.onClick?.()}
    >
      <box flexDirection="row" justifyContent="space-between" backgroundColor={bg()}>
        <text fg={titleFg()} attributes={props.selected ? 1 : 0} bg={bg()}>
          {displayName()}
        </text>
        <box flexDirection="row" backgroundColor={bg()} gap={1}>
          <Show when={busy()}>
            <text fg={colors.warning} bg={bg()}>
              {SPINNER_FRAMES[spinnerIdx()]}
            </text>
          </Show>
          <text fg={iconColorFor(status())} bg={bg()}>
            {iconFor(status())}
          </text>
        </box>
      </box>
      <text fg={branchFg()} bg={bg()}>
        {branch()}
      </text>
      {/* Starship-style status segments on their own line, prefixed with a
       *  muted `Git` label so it reads like a footer status chip. Whole row
       *  collapses when the working tree is clean AND the branch is synced —
       *  the same behaviour as the user's prompt's `[git_status]` block.
       *  Segments come from `gitStatus` (porcelain=v2, see git/status.ts)
       *  and `commitStats`. */}
      <Show when={statusSegments().length > 0}>
        <box flexDirection="row" backgroundColor={bg()} gap={1}>
          <text fg={colors.muted} bg={bg()}>
            Git
          </text>
          <For each={statusSegments()}>
            {(seg) => (
              <text fg={seg.fg} bg={bg()}>
                {seg.text}
              </text>
            )}
          </For>
        </box>
      </Show>
    </box>
  );
}

function iconFor(status: Status): string {
  switch (status) {
    case Status.Running:
      return icons.running;
    case Status.Ready:
      return icons.ready;
    case Status.Loading:
      return icons.loading;
    case Status.Paused:
      return icons.paused;
    case Status.Error:
      return icons.error;
  }
}

function iconColorFor(status: Status): string | RGBA {
  switch (status) {
    case Status.Running:
      return colors.statusRunning;
    case Status.Ready:
      return colors.statusReady;
    case Status.Loading:
      return colors.statusLoading;
    case Status.Paused:
      return colors.statusPaused;
    case Status.Error:
      return colors.statusError;
  }
}
