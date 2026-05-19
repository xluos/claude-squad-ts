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
}

export function InstanceList(props: InstanceListProps) {
  return (
    <box flexDirection="column" width={props.width} height={props.height}>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
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
            <box paddingTop={1} flexDirection="row">
              <text fg={colors.muted}>No instances. Press </text>
              <text fg="cyan">n</text>
              <text fg={colors.muted}> to create.</text>
            </box>
          }
        >
          <For each={props.instances}>
            {(inst, idx) => (
              <Row instance={inst} index={idx() + 1} selected={idx() === props.selectedIndex} />
            )}
          </For>
        </Show>
      </box>
    </box>
  );
}

interface RowProps {
  instance: Instance;
  index: number;
  selected: boolean;
}

function Row(props: RowProps) {
  const displayName = () => props.instance.displayName || props.instance.title;
  const branch = () => props.instance.branch || '(pending)';
  const stats = () => props.instance.diffStats;

  const bg = () => (props.selected ? colors.selectedBg : undefined);

  return (
    <box flexDirection="column" backgroundColor={bg()}>
      <box flexDirection="row" justifyContent="space-between" backgroundColor={bg()}>
        <box flexDirection="row" backgroundColor={bg()}>
          <text fg={colors.muted} bg={bg()}>
            {`${props.index}. `}
          </text>
          <text
            fg={props.selected ? colors.accent : 'white'}
            attributes={props.selected ? 1 : 0}
            bg={bg()}
          >
            {displayName()}
          </text>
        </box>
        <text fg={iconColorFor(props.instance.status)} bg={bg()}>
          {iconFor(props.instance.status)}
        </text>
      </box>
      <box flexDirection="row" justifyContent="space-between" backgroundColor={bg()}>
        <text fg={colors.muted} bg={bg()}>
          {`   λ-${branch()}`}
        </text>
        <Show when={stats().added > 0 || stats().removed > 0}>
          <box flexDirection="row" backgroundColor={bg()}>
            <text fg={colors.diffAdded} bg={bg()}>{`+${stats().added}`}</text>
            <text fg={colors.muted} bg={bg()}>
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
