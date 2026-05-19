import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';
import type { Instance } from '../../session/instance.js';
import { colors, icons } from '../../shared/styles.js';
import { Status } from '../../shared/types.js';

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
}

export function InstanceList(props: InstanceListProps) {
  return (
    <box flexDirection="column" width={props.width} height={props.height}>
      {/* Top spacer: the right column's tab strip is 2 rows tall
       *  (label row + ━ underline row). One blank row above the chip
       *  on the left lines the InstanceList border top up with the
       *  TabbedWindow content-area border top on the right. */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
        marginTop={1}
      >
        <text bg={colors.primary} fg="white" attributes={1}>
          {' Instances '}
        </text>
        <Show when={props.autoYes}>
          <text bg={colors.warning} fg="black" attributes={1}>
            {' auto-yes '}
          </text>
        </Show>
      </box>
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
              <text fg={colors.muted}>No sessions yet.</text>
              <text> </text>
              <box flexDirection="row">
                <text fg="cyan">n</text>
                <text fg={colors.muted}> name a new session</text>
              </box>
              <box flexDirection="row">
                <text fg="cyan">N</text>
                <text fg={colors.muted}> start one with a prompt</text>
              </box>
              <box flexDirection="row">
                <text fg="cyan">?</text>
                <text fg={colors.muted}> full help</text>
              </box>
            </box>
          }
        >
          <For each={props.instances}>
            {(inst, idx) => (
              <Row
                instance={inst}
                index={idx() + 1}
                selected={idx() === props.selectedIndex}
                rev={props.rev}
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
  index: number;
  selected: boolean;
  rev: number;
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
  const stats = () => {
    void props.rev;
    return props.instance.diffStats;
  };
  const status = () => {
    void props.rev;
    return props.instance.status;
  };
  // Mirror the Go reference: selected rows use a light-blue-grey background
  // (#dde4f0) with dark text for contrast. Padding-X gives the band of
  // colour breathing room from the outer border instead of butting against
  // it like before.
  const bg = () => (props.selected ? colors.selectedBg : undefined);
  const titleFg = () => (props.selected ? colors.selectedFg : 'white');
  const indexFg = () => (props.selected ? colors.selectedFg : colors.muted);
  const branchFg = () => (props.selected ? colors.selectedBranch : colors.muted);

  return (
    <box flexDirection="column" backgroundColor={bg()} paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" justifyContent="space-between" backgroundColor={bg()}>
        <box flexDirection="row" backgroundColor={bg()}>
          <text fg={indexFg()} bg={bg()}>
            {`${props.index}. `}
          </text>
          <text fg={titleFg()} attributes={props.selected ? 1 : 0} bg={bg()}>
            {displayName()}
          </text>
        </box>
        <text fg={iconColorFor(status())} bg={bg()}>
          {iconFor(status())}
        </text>
      </box>
      <box flexDirection="row" justifyContent="space-between" backgroundColor={bg()}>
        <text fg={branchFg()} bg={bg()}>
          {`   λ-${branch()}`}
        </text>
        <Show when={stats().added > 0 || stats().removed > 0}>
          <box flexDirection="row" backgroundColor={bg()}>
            <text fg={colors.diffAdded} bg={bg()}>{`+${stats().added}`}</text>
            <text fg={branchFg()} bg={bg()}>
              ,
            </text>
            <text fg={colors.diffRemoved} bg={bg()}>{`-${stats().removed}`}</text>
          </box>
        </Show>
      </box>
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
  }
}

function iconColorFor(status: Status): string {
  switch (status) {
    case Status.Running:
      return colors.statusRunning;
    case Status.Ready:
      return colors.statusReady;
    case Status.Loading:
      return colors.statusLoading;
    case Status.Paused:
      return colors.statusPaused;
  }
}
