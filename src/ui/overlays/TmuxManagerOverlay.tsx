import { useKeyboard } from '@opentui/solid';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { TmuxSessionInfo } from '../../session/tmux/tmux.js';
import { TMUX_PREFIX } from '../../shared/constants.js';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';

export interface TmuxPanelEntry extends TmuxSessionInfo {
  /** Title of the tracked Instance owning this session, or null if orphan. */
  trackedTitle: string | null;
  /** Project name when the session belongs to a different project, or null. */
  foreignProject: string | null;
}

export interface TmuxManagerOverlayProps {
  entries: TmuxPanelEntry[];
  width: number;
  onClose: () => void;
  onKill: (name: string) => void | Promise<void>;
  onKillOrphans: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

type ConfirmState = { kind: 'single'; name: string } | { kind: 'orphans'; count: number } | null;

function ageOf(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function shortName(name: string): string {
  // The full `claudesquad_xxx` prefix on every row is visual noise; the
  // panel title already says these are our tmux sessions. Strip it for
  // display, keep the raw name available for `tmux kill-session -t`.
  return name.startsWith(TMUX_PREFIX) ? name.slice(TMUX_PREFIX.length) : name;
}

export function TmuxManagerOverlay(props: TmuxManagerOverlayProps) {
  const [selected, setSelected] = createSignal(0);
  const [confirm, setConfirm] = createSignal<ConfirmState>(null);

  const safeSelected = createMemo(() => {
    const n = props.entries.length;
    if (n === 0) return 0;
    const s = selected();
    if (s < 0) return 0;
    if (s >= n) return n - 1;
    return s;
  });

  const orphanCount = createMemo(
    () => props.entries.filter((e) => e.trackedTitle === null && e.foreignProject === null).length,
  );

  useKeyboard((e) => {
    const c = confirm();
    if (c) {
      if (e.name === 'return' || e.sequence === 'y' || e.sequence === 'Y') {
        if (c.kind === 'single') {
          setConfirm(null);
          void props.onKill(c.name);
        } else {
          setConfirm(null);
          void props.onKillOrphans();
        }
        return;
      }
      if (e.name === 'escape' || e.sequence === 'n' || e.sequence === 'N') {
        setConfirm(null);
        return;
      }
      return;
    }
    if (e.name === 'escape' || e.sequence === 'q') {
      props.onClose();
      return;
    }
    if (e.name === 'up' || e.sequence === 'k') {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (e.name === 'down' || e.sequence === 'j') {
      setSelected((s) => Math.min(Math.max(0, props.entries.length - 1), s + 1));
      return;
    }
    if (e.sequence === 'r') {
      void props.onRefresh();
      return;
    }
    if (e.sequence === 'd') {
      const idx = safeSelected();
      const target = props.entries[idx];
      if (target) setConfirm({ kind: 'single', name: target.name });
      return;
    }
    if (e.sequence === 'a') {
      const n = orphanCount();
      if (n > 0) setConfirm({ kind: 'orphans', count: n });
    }
  });

  const COLS = {
    badge: 9,
    name: 22,
    cmd: 14,
    win: 5,
    size: 9,
    age: 5,
  } as const;

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
      gap={0}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={colors.primary} attributes={3 /* BOLD | UNDERLINE */}>
          {t((m) => m.tmuxPanel.title)}
        </text>
        <text fg={colors.muted}>
          {t((m) => m.tmuxPanel.summary)(props.entries.length, orphanCount())}
        </text>
      </box>

      <box flexDirection="row" paddingTop={1}>
        <text fg={colors.muted}>{''.padEnd(COLS.badge)}</text>
        <text fg={colors.muted} attributes={1}>
          {t((m) => m.tmuxPanel.headerName).padEnd(COLS.name)}
        </text>
        <text fg={colors.muted} attributes={1}>
          {t((m) => m.tmuxPanel.headerCmd).padEnd(COLS.cmd)}
        </text>
        <text fg={colors.muted} attributes={1}>
          {t((m) => m.tmuxPanel.headerWindows).padEnd(COLS.win)}
        </text>
        <text fg={colors.muted} attributes={1}>
          {t((m) => m.tmuxPanel.headerSize).padEnd(COLS.size)}
        </text>
        <text fg={colors.muted} attributes={1}>
          {t((m) => m.tmuxPanel.headerAge).padEnd(COLS.age)}
        </text>
      </box>

      <Show
        when={props.entries.length > 0}
        fallback={
          <box paddingTop={1} paddingBottom={1}>
            <text fg={colors.muted}>{t((m) => m.tmuxPanel.empty)}</text>
          </box>
        }
      >
        <For each={props.entries}>
          {(entry, i) => {
            const isSelected = () => i() === safeSelected();
            const orphan = () => entry.trackedTitle === null && entry.foreignProject === null;
            const foreign = () => entry.trackedTitle === null && entry.foreignProject !== null;
            const badgeText = () =>
              orphan()
                ? t((m) => m.tmuxPanel.badgeOrphan)
                : foreign()
                  ? t((m) => m.tmuxPanel.badgeForeign)
                  : entry.attached
                    ? t((m) => m.tmuxPanel.badgeAttached)
                    : t((m) => m.tmuxPanel.badgeTracked);
            const badgeColor = () =>
              orphan()
                ? colors.warning
                : foreign()
                  ? colors.muted
                  : entry.attached
                    ? colors.statusRunning
                    : colors.statusReady;
            const rowFg = () => (isSelected() ? colors.selectedFg : 'white');
            const rowBg = () => (isSelected() ? colors.selectedBg : undefined);
            const sizeText = () =>
              entry.width && entry.height ? `${entry.width}×${entry.height}` : '—';
            const nameText = () => {
              const base = shortName(entry.name);
              if (entry.trackedTitle && entry.trackedTitle !== base) {
                return `${base} (${entry.trackedTitle})`;
              }
              if (entry.foreignProject) {
                return `${base} (${entry.foreignProject})`;
              }
              return base;
            };
            const cmdText = () => entry.command || '—';
            return (
              <box flexDirection="row" backgroundColor={rowBg()}>
                <text fg={badgeColor()}>{badgeText().padEnd(COLS.badge)}</text>
                <text fg={rowFg()}>{nameText().padEnd(COLS.name)}</text>
                <text fg={rowFg()}>{cmdText().padEnd(COLS.cmd)}</text>
                <text fg={rowFg()}>{String(entry.windows).padEnd(COLS.win)}</text>
                <text fg={rowFg()}>{sizeText().padEnd(COLS.size)}</text>
                <text fg={rowFg()}>{ageOf(entry.createdAt).padEnd(COLS.age)}</text>
              </box>
            );
          }}
        </For>
      </Show>

      <box paddingTop={1} flexDirection="column">
        <Show
          when={confirm()}
          fallback={<text fg={colors.muted}>{t((m) => m.tmuxPanel.keysHint)}</text>}
        >
          {(c) => (
            <box flexDirection="row" gap={1}>
              <text fg={colors.warning} attributes={1}>
                {c().kind === 'single'
                  ? t((m) => m.tmuxPanel.confirmKill)(
                      shortName((c() as { kind: 'single'; name: string }).name),
                    )
                  : t((m) => m.tmuxPanel.confirmKillOrphans)(
                      (c() as { kind: 'orphans'; count: number }).count,
                    )}
              </text>
              <text fg={colors.muted}>{t((m) => m.tmuxPanel.confirmYesNo)}</text>
            </box>
          )}
        </Show>
      </box>
    </box>
  );
}
