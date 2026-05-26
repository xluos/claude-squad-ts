import { defaultTextareaKeyBindings, type TextareaRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { makeCommitMessageProvider } from '../session/git/commit-hook.js';
import {
  fastForwardWorktreeToHost,
  mergeIntoHost,
  precheckMerge,
  precheckPullFromHost,
  pullFromHost,
  squashMergeIntoHost,
} from '../session/git/merge.js';
import { fetchPrune, getHostBranch, searchBranches } from '../session/git/util.js';
import { Instance } from '../session/instance.js';
import { createStorage } from '../session/storage.js';
import {
  killTmuxSession,
  listLiveTmuxSessionInfos,
  type TmuxSessionInfo,
  tmuxNameOf,
} from '../session/tmux/tmux.js';
import { writeClipboard } from '../shared/clipboard.js';
import { effectiveProgram, getProfiles } from '../shared/config.js';
import {
  AUTO_PULL_COOLDOWN_MS,
  BRANCH_SEARCH_DEBOUNCE_MS,
  HELP_BIT_INSTANCE_ATTACH,
  HELP_BIT_INSTANCE_CHECKOUT,
  HELP_BIT_INSTANCE_START,
  MAX_INSTANCES,
  METADATA_TICK_DIVISOR_NON_SELECTED,
  METADATA_TICK_DIVISOR_PAUSED,
  METADATA_TICK_MS,
} from '../shared/constants.js';
import { formatBlocker, t } from '../shared/i18n.js';
import { log } from '../shared/logger.js';
import { loadGlobalState, loadProjectState, markHelpSeen } from '../shared/state.js';
import { colors } from '../shared/styles.js';
import type { AppConfig } from '../shared/types.js';
import { APP_STATE, Status } from '../shared/types.js';
import { Diff } from '../ui/components/Diff.js';
import { ErrorBox } from '../ui/components/ErrorBox.js';
import { InstanceList } from '../ui/components/List.js';
import { Menu, type MenuMode } from '../ui/components/Menu.js';
import { NewInstanceRow } from '../ui/components/NewInstanceRow.js';
import { Preview } from '../ui/components/Preview.js';
import { TabbedWindow } from '../ui/components/TabbedWindow.js';
import { ConfirmationOverlay } from '../ui/overlays/ConfirmationOverlay.js';
import { HelpOverlay } from '../ui/overlays/HelpOverlay.js';
import { agentLabel, MergeOverlay } from '../ui/overlays/MergeOverlay.js';
import { OnboardingOverlay } from '../ui/overlays/OnboardingOverlay.js';
import { SendPromptOverlay } from '../ui/overlays/SendPromptOverlay.js';
import { TmuxManagerOverlay, type TmuxPanelEntry } from '../ui/overlays/TmuxManagerOverlay.js';
import { createAppStore } from './state.js';

/**
 * Textarea key bindings tweaked for prompt-style usage. Replaces OpenTUI's
 * default (Enter → newline, Meta+Enter → submit) with Enter → submit, and
 * keeps Shift+Enter as an explicit newline. Everything else (cursor moves,
 * word-wise edits, undo, etc.) is inherited from `defaultTextareaKeyBindings`
 * — we only swap the Enter / kpenter / linefeed entries.
 */
const SUBMIT_ON_ENTER_BINDINGS = [
  // Our overrides come first so the textarea sees them before the defaults
  // would have matched a less-specific entry.
  { name: 'return', shift: true, action: 'newline' as const },
  { name: 'kpenter', shift: true, action: 'newline' as const },
  { name: 'return', action: 'submit' as const },
  { name: 'kpenter', action: 'submit' as const },
  { name: 'linefeed', action: 'submit' as const },
  ...defaultTextareaKeyBindings.filter(
    (b) => !(b.name === 'return' || b.name === 'kpenter' || b.name === 'linefeed'),
  ),
];

export interface AppProps {
  config: AppConfig;
  repoPath: string;
  /** Stable per-repo identifier. Scopes state.json + worktree dir under
   *  `~/.claude-squad/projects/<projectID>/`. Resolved at CLI entry from
   *  `repoPath` via sha256-truncate. */
  projectID: string;
  programOverride?: string;
  autoYes?: boolean;
  onAttachRequest: (instance: Instance) => Promise<void>;
  onExit: () => void;
}

export function App(props: AppProps) {
  const store = createAppStore();
  const dims = useTerminalDimensions();
  const storage = createStorage(props.projectID, props.repoPath);
  const profiles = createMemo(() => getProfiles(props.config));
  const defaultProgram = createMemo(() => props.programOverride ?? effectiveProgram(props.config));

  // Textarea state
  // Two textarea instances live in the tree:
  //   - `nameTextareaRef`: the inline one in the instance list, used when
  //     the user is naming a brand-new session (state === New).
  //   - `textareaRef`: the wide one at the bottom of the right pane, used
  //     for the prompt-mode flow (state === Prompt) where the user types
  //     a longer message and picks a branch / profile.
  // Only one is focused at a time, matching `inputFocused()` and the
  // current store.model.state.
  let textareaRef: TextareaRenderable | undefined;
  let nameTextareaRef: TextareaRenderable | undefined;
  const [inputValue, setInputValue] = createSignal('');
  const [creatingInstance, setCreatingInstance] = createSignal(false);

  // ===== Persistence: restore + save =====
  //
  // Restore-then-save invariant: Solid creates the store with `instances: []`
  // *before* the async load can populate it. A naïve
  //   createEffect(() => storage.saveInstances(store.model.instances))
  // would fire on the very first commit with the empty placeholder and
  // overwrite state.json before the async load gets a chance to read it
  // — wiping every previously-created session on every launch. We guard
  // saves with a `restored` flag that flips to true only after the load
  // path has finished writing the real list into the store.
  const [restored, setRestored] = createSignal(false);
  // Footer indicator + tmux manager overlay data source. Refreshed alongside
  // the metadata tick so we don't shell out more often than necessary. The
  // overlay also forces a refresh on open and after any kill so the view
  // reflects the result of the user's action immediately rather than after
  // the next tick.
  const [tmuxInfos, setTmuxInfos] = createSignal<TmuxSessionInfo[]>([]);
  const [crossProjectNames, setCrossProjectNames] = createSignal<Map<string, string>>(new Map());

  // Idempotent — safe to call from the metadata tick, from the overlay's
  // own refresh handler, and right after a kill. Silently swallows tmux
  // errors so the periodic tick never noisy-toasts.
  async function refreshTmuxInfos(): Promise<void> {
    try {
      const infos = await listLiveTmuxSessionInfos();
      setTmuxInfos(infos);
    } catch {
      // tmux missing / errored — leave the previous reading alone.
    }
  }

  async function refreshCrossProjectNames(): Promise<void> {
    try {
      const global = await loadGlobalState();
      const map = new Map<string, string>();
      for (const project of global.projects) {
        if (project.id === props.projectID) continue;
        try {
          const state = await loadProjectState(project.id, project.repo_path);
          for (const inst of state.instances) {
            if (inst.status === Status.Paused) continue;
            const name = tmuxNameOf(inst.title);
            if (!map.has(name)) map.set(name, project.name);
          }
        } catch {
          // Skip unreadable projects.
        }
      }
      setCrossProjectNames(map);
    } catch {
      // Leave previous reading alone.
    }
  }

  // Bridges tmux's view of the world to the Instance list to mark each
  // session tracked / orphan. Reading `store.model.rev` keeps the memo
  // subscribed to the same change pulse as the rest of the UI (paused
  // toggles, restored sessions, etc.).
  const tmuxPanelEntries = createMemo<TmuxPanelEntry[]>(() => {
    void store.model.rev;
    const trackedByName = new Map<string, string>();
    for (const inst of store.model.instances) {
      if (inst.hasStarted() && !inst.isPaused()) {
        trackedByName.set(tmuxNameOf(inst.title), inst.displayName ?? inst.title);
      }
    }
    const foreignNames = crossProjectNames();
    return tmuxInfos().map((info) => ({
      ...info,
      trackedTitle: trackedByName.get(info.name) ?? null,
      foreignProject: trackedByName.has(info.name) ? null : (foreignNames.get(info.name) ?? null),
    }));
  });
  const tmuxLiveCount = createMemo(() => tmuxPanelEntries().length);
  const tmuxOrphanCount = createMemo(
    () =>
      tmuxPanelEntries().filter((e) => e.trackedTitle === null && e.foreignProject === null).length,
  );
  onMount(async () => {
    try {
      const persisted = await loadGlobalState();
      store.setHelpSeenMask(persisted.help_screens_seen);
      const loaded = await storage.loadInstances(props.config.branch_prefix);
      for (const inst of loaded) {
        if (!inst.isPaused()) {
          try {
            await inst.start(false);
          } catch (err) {
            log.warn(`failed to restore ${inst.title}`, err);
          }
        }
      }
      store.setInstances(loaded);
      // `fromPersisted` doesn't restore commitStats — the field starts at
      // {0,0}, which collapses the ↑/↓ segment until the next tick. Kick
      // off an async refresh now so the initial render shows real values
      // (matters for paused instances too: the tick still updates them,
      // but the first frame would otherwise lie about "no divergence").
      void (async () => {
        const results = await Promise.all(
          loaded.map((inst) =>
            inst.computeCommitStats().then(
              () => true,
              () => false,
            ),
          ),
        );
        if (results.some(Boolean)) store.bumpRev();
      })();
    } catch (err) {
      store.setError(errMsg(err));
    } finally {
      // Always lift the gate, even on error — otherwise a transient load
      // failure would silently disable persistence for the rest of the run.
      setRestored(true);
    }
  });

  createEffect(() => {
    if (!restored()) return;
    // Tracking trap: Solid's createStore + `produce(m => m.instances.push(...))`
    // mutates the array in place, so just reading `store.model.instances`
    // doesn't register a dep on length/index changes. Read `length` AND
    // `rev` so the effect re-runs on (a) add/remove and (b) any
    // bumpRev-emitting field mutation (status flips, branch resolves,
    // diff stats refresh).
    void store.model.instances.length;
    void store.model.rev;
    void storage.saveInstances(store.model.instances).catch((err) => log.error('save failed', err));
  });

  // ===== Periodic metadata refresh =====
  //
  // Each tick we reconcile each instance's status with what tmux reports.
  // Heavier git work (commitStats / diff / gitStatus) is throttled per row:
  //   - selected instance: every tick (responsive while the user looks at it)
  //   - non-selected active: every METADATA_TICK_DIVISOR_NON_SELECTED ticks
  //   - paused: every METADATA_TICK_DIVISOR_PAUSED ticks, commitStats only
  // After mutations we bump the model's `rev` counter so dependent Solid
  // memos (which read instance-internal class fields invisible to the
  // store) re-evaluate. Operations that need fresh numbers immediately
  // (merge / pull / apply) call computeCommitStats + bumpRev directly
  // rather than waiting for a tick.
  onMount(() => {
    let tickCount = 0;
    const id = setInterval(() => {
      void (async () => {
        tickCount++;
        const insts = store.model.instances;
        let dirty = false;
        for (let i = 0; i < insts.length; i++) {
          const inst = insts[i]!;
          if (!inst.hasStarted()) continue;
          // checkAlive every tick — tmux death should surface quickly,
          // and it's cheap (no git, just a tmux has-session check).
          const prevStatus = inst.status;
          try {
            await inst.checkAlive();
          } catch {
            // ignore
          }
          if (inst.status !== prevStatus) dirty = true;

          const isSelected = i === store.model.selected;
          const isPaused = inst.isPaused();
          const divisor = isSelected
            ? 1
            : isPaused
              ? METADATA_TICK_DIVISOR_PAUSED
              : METADATA_TICK_DIVISOR_NON_SELECTED;
          if (tickCount % divisor !== 0) continue;

          // commitStats runs in the host repo (`git -C repo_path rev-list`)
          // and doesn't touch the worktree dir, so it stays meaningful even
          // when the instance is paused — e.g. the user merged the branch
          // from outside and ↑/↓ should drop to zero.
          try {
            const prev = `${inst.commitStats.ahead}|${inst.commitStats.behind}`;
            await inst.computeCommitStats();
            const next = `${inst.commitStats.ahead}|${inst.commitStats.behind}`;
            if (prev !== next) dirty = true;
          } catch {
            // ignore transient git errors
          }
          if (isPaused) continue;
          try {
            const prev = `${inst.diffStats.added}|${inst.diffStats.removed}`;
            if (isSelected) await inst.computeDiff();
            else await inst.computeDiffNumstat();
            const next = `${inst.diffStats.added}|${inst.diffStats.removed}`;
            if (prev !== next) dirty = true;
          } catch {
            // ignore transient git errors
          }
          try {
            const g = inst.gitStatus;
            const prev = `${g.modified}|${g.untracked}|${g.staged}|${g.deleted}|${g.renamed}|${g.conflicted}`;
            await inst.computeGitStatus();
            const n = inst.gitStatus;
            const next = `${n.modified}|${n.untracked}|${n.staged}|${n.deleted}|${n.renamed}|${n.conflicted}`;
            if (prev !== next) dirty = true;
          } catch {
            // ignore transient git errors
          }
        }
        if (dirty) store.bumpRev();
        await refreshTmuxInfos();
        if (tickCount % METADATA_TICK_DIVISOR_PAUSED === 0) {
          await refreshCrossProjectNames();
        }

        // Auto-pull: when enabled, trigger `u`-equivalent for running
        // instances that have fallen behind and can be pulled cleanly.
        if (props.config.auto_pull) {
          const now = Date.now();
          for (const inst of insts) {
            if (inst.isPaused() || inst.busy) continue;
            if (inst.commitStats.behind <= 0) continue;
            if (now - inst.autoPullFailedAt < AUTO_PULL_COOLDOWN_MS) continue;
            const wt = inst.worktreePath();
            const base = inst.baseBranch();
            if (!wt || !base) continue;
            void autoPullInstance(inst, wt, base);
          }
        }
      })();
    }, METADATA_TICK_MS);
    onCleanup(() => clearInterval(id));
  });

  // ===== Branch search (only while in prompt mode) =====
  createEffect(
    on(
      () => [store.model.state, inputValue()] as const,
      ([state, filter]) => {
        if (state !== APP_STATE.Prompt) return;
        const id = setTimeout(async () => {
          await fetchPrune(props.repoPath).catch(() => undefined);
          const results = await searchBranches(props.repoPath, filter).catch(() => []);
          store.setBranches(filter, results);
          if (results.length > 0 && !store.model.selectedBranch) {
            store.selectBranch(results[0]!);
          }
        }, BRANCH_SEARCH_DEBOUNCE_MS);
        onCleanup(() => clearTimeout(id));
      },
    ),
  );

  // ===== Global key handling =====
  // Active only when no modal is open AND the textarea isn't capturing input.
  const inputFocused = createMemo(
    () =>
      store.model.state === APP_STATE.New ||
      store.model.state === APP_STATE.Prompt ||
      store.model.state === APP_STATE.Send,
  );
  const modalOpen = createMemo(
    () =>
      store.model.state === APP_STATE.Confirm ||
      store.model.state === APP_STATE.Help ||
      store.model.state === APP_STATE.Merge ||
      store.model.state === APP_STATE.Tmux,
  );

  useKeyboard((e) => {
    if (modalOpen() || inputFocused()) return;
    const name = e.name;
    const seq = e.sequence;
    // Cmd / Option / Hyper modifier: skip our letter shortcuts so e.g.
    // Cmd+C (macOS copy) doesn't accidentally trigger the checkout
    // confirmation. ctrl is excluded from the guard because Ctrl+C
    // legitimately means "quit" below. Note: terminals that don't
    // implement the Kitty keyboard protocol can't report Cmd at all —
    // for those, the user has to configure their terminal app to
    // intercept Cmd+C as system clipboard (Ghostty / iTerm2 / Terminal
    // do by default).
    const modified = Boolean(
      (e as { super?: boolean; hyper?: boolean }).super ||
        (e as { hyper?: boolean }).hyper ||
        e.meta ||
        e.option,
    );

    if (e.ctrl && name === 'c') {
      props.onExit();
      return;
    }
    if (modified) return;
    if (seq === 'q') {
      props.onExit();
      return;
    }
    if (seq === 'n') {
      if (store.model.instances.length >= MAX_INSTANCES) {
        store.setError(t((m) => m.toast.instanceLimit)(MAX_INSTANCES));
        return;
      }
      store.setPressedKey('n');
      // Defer the state mutation + focus to the next microtask. Without
      // this, OpenTUI's still-in-flight 'n' keypress reaches the freshly
      // focused NewInstanceRow textarea and gets typed into the buffer.
      // By the time the microtask runs, the original key event has been
      // fully dispatched, so the textarea sees only future keystrokes.
      queueMicrotask(() => {
        setInputValue('');
        store.openNewName();
        nameTextareaRef?.focus();
      });
      return;
    }
    if (seq === 'N') {
      if (store.model.instances.length >= MAX_INSTANCES) {
        store.setError(t((m) => m.toast.instanceLimit)(MAX_INSTANCES));
        return;
      }
      store.setPressedKey('N');
      // Same rationale as the `n` branch — defer so the triggering key
      // doesn't end up in the prompt-pane textarea.
      queueMicrotask(() => {
        setInputValue('');
        store.openNewWithPrompt();
        textareaRef?.focus();
      });
      return;
    }
    if (seq === '?') {
      store.openHelp();
      return;
    }
    if (seq === 'T') {
      store.setPressedKey('T');
      store.openTmux();
      // Pull a fresh snapshot the moment the panel opens; otherwise the
      // user sees the last tick's view (could be up to METADATA_TICK_MS
      // stale) until the next refresh fires.
      void refreshTmuxInfos();
      void refreshCrossProjectNames();
      return;
    }
    if (name === 'escape' && store.model.scrollMode) {
      // Esc pops out of preview/diff scroll mode back to the live tail.
      store.exitScrollMode();
      return;
    }
    if (e.shift && name === 'up') {
      store.scrollUp();
      return;
    }
    if (e.shift && name === 'down') {
      store.scrollDown();
      return;
    }
    if (name === 'up' || seq === 'k') {
      store.moveSelectionUp();
      return;
    }
    if (name === 'down' || seq === 'j') {
      store.moveSelectionDown();
      return;
    }
    if (seq === 'K') {
      store.reorderUp();
      return;
    }
    if (seq === 'J') {
      store.reorderDown();
      return;
    }
    if (name === 'tab') {
      store.cycleTab();
      return;
    }
    const selected = store.model.instances[store.model.selected];
    if (!selected) return;
    if (name === 'return' || seq === 'o') {
      // Paused instances no longer have a worktree — attaching would
      // drop the user into a tmux pane running in a deleted directory.
      // Force them through `r` (resume) first.
      if (selected.isPaused()) {
        store.setError(t((m) => m.toast.pausedNeedResume));
        return;
      }
      // First-time attach: show the onboarding overlay; on dismiss the
      // overlay fires the actual attach. After that we go straight in.
      if ((store.model.helpSeenMask & HELP_BIT_INSTANCE_ATTACH) === 0) {
        store.setPendingHelp({ kind: 'attach', instance: selected });
        return;
      }
      void doAttach(selected);
      return;
    }
    if (seq === 'd') {
      store.setPressedKey('d');
      store.openConfirm({ kind: 'kill', index: store.model.selected });
      return;
    }
    if (seq === 'i') {
      // Forward a single prompt into the live tmux pane without attaching.
      // Paused = no tmux, so reject before opening an input that can't be
      // submitted; not-yet-started instances are skipped the same way.
      if (selected.isPaused() || !selected.hasStarted()) {
        store.setError(t((m) => m.toast.sendNotRunning));
        return;
      }
      store.setPressedKey('i');
      // Defer state transition past this `i` keypress so the overlay's
      // freshly focused textarea doesn't eat the original key as input.
      // The overlay focuses its own textarea on mount.
      queueMicrotask(() => store.openSendPrompt());
      return;
    }
    if (seq === 'c') {
      store.setPressedKey('c');
      // First-time checkout: show the onboarding overlay; on dismiss it
      // opens the normal confirmation flow.
      if ((store.model.helpSeenMask & HELP_BIT_INSTANCE_CHECKOUT) === 0) {
        store.setPendingHelp({ kind: 'checkout', index: store.model.selected });
        return;
      }
      store.openConfirm({ kind: 'pause', index: store.model.selected });
      return;
    }
    if (seq === 's') {
      store.setPressedKey('s');
      store.openConfirm({ kind: 'push', index: store.model.selected });
      return;
    }
    if (seq === 'r') {
      store.setPressedKey('r');
      void (async () => {
        // Kick off resume but bump rev *before* awaiting so the
        // Loading spinner appears immediately — resume() sets
        // Status.Loading synchronously before its first await.
        const p = selected.resume();
        store.bumpRev();
        try {
          await p;
          store.replaceInstance(selected);
        } catch (err) {
          store.setError(errMsg(err));
          store.bumpRev();
        }
      })();
      return;
    }
    if (seq === 'm' || seq === 'M' || seq === 'u' || seq === 'a') {
      if (selected.busy) {
        store.setError(t((m) => m.toast.instanceBusy));
        return;
      }
    }
    if (seq === 'm') {
      store.setPressedKey('m');
      void openMergeFlow(store.model.selected, selected, false);
      return;
    }
    if (seq === 'M') {
      store.setPressedKey('M');
      void openMergeFlow(store.model.selected, selected, true);
      return;
    }
    if (seq === 'u') {
      store.setPressedKey('u');
      void runPullFromHost(selected);
      return;
    }
    if (seq === 'a') {
      store.setPressedKey('a');
      void openApplyFlow(store.model.selected, selected);
      return;
    }
  });

  // ===== Merge =====
  // Runs the precheck up front so the overlay can render its outcome
  // immediately. We never touch the host worktree here — `precheckMerge`
  // uses `git merge-tree`, which writes only to the object DB.
  async function openMergeFlow(index: number, inst: Instance, killAfter: boolean): Promise<void> {
    if (!inst.branch) {
      store.setError(t((m) => m.toast.noBranchYet));
      return;
    }
    try {
      await inst.computeCommitStats().catch(() => undefined);
      if (inst.commitStats.ahead === 0 && !(await inst.isDirty().catch(() => false))) {
        store.setError(t((m) => m.toast.nothingToMerge));
        return;
      }
      const [result, dirty] = await Promise.all([
        precheckMerge(props.repoPath, inst.branch),
        inst.isDirty().catch(() => false),
      ]);
      store.openMergeOverlay({
        index,
        sourceBranch: inst.branch,
        hostBranch: result.hostBranch,
        hostPath: props.repoPath,
        conflicts: result.conflicts,
        blocker: result.blocker,
        program: inst.program,
        dirty,
        killAfter,
      });
    } catch (err) {
      store.setError(errMsg(err));
    }
  }

  async function handleMergeConfirm(): Promise<void> {
    const preview = store.model.mergePreview;
    if (!preview) return;
    const inst = store.model.instances[preview.index];
    store.closeOverlay();
    if (inst) {
      inst.busy = true;
      store.bumpRev();
    }
    try {
      let autoCommitted = false;
      if (inst) {
        autoCommitted = await inst.commitDirty(
          `[claudesquad] auto-commit on merge of ${inst.title}`,
          makeCommitMessageProvider(props.config, 'autoCommit'),
        );
      }
      await mergeIntoHost(
        preview.hostPath,
        preview.sourceBranch,
        makeCommitMessageProvider(props.config, 'merge'),
      );

      if (!preview.killAfter && inst) {
        const wt = inst.worktreePath();
        if (wt) {
          try {
            await fastForwardWorktreeToHost(wt, preview.hostBranch);
          } catch (err) {
            log.warn(`worktree FF to ${preview.hostBranch} failed: ${errMsg(err)}`);
          }
        }
      }

      if (inst) await inst.updateDiffBase().catch(() => undefined);

      let retired = false;
      if (preview.killAfter && inst) {
        try {
          await inst.kill();
          store.removeInstance(inst.title);
          retired = true;
        } catch (err) {
          store.setError(t((m) => m.toast.cleanupFailed)(errMsg(err)));
        }
      }
      if (inst) inst.busy = false;
      store.setInfo(
        t((m) => m.toast.merged)(preview.sourceBranch, preview.hostBranch, autoCommitted, retired),
      );
      if (!retired) {
        await inst?.computeDiff().catch(() => undefined);
        await Promise.all(
          store.model.instances.map((i) => i.computeCommitStats().catch(() => undefined)),
        );
        store.bumpRev();
      }
    } catch (err) {
      if (inst) inst.busy = false;
      store.setError(errMsg(err));
      store.bumpRev();
    }
  }

  // ===== Pull from host =====
  // Reverse direction of the merge flow: fold the *instance's base branch*
  // back down into the worktree so the agent picks up infra/base changes
  // landed since the fork. Source is the pinned base branch, not host's
  // current HEAD — if host has since switched branches, that's irrelevant
  // to this task. No overlay: precheck (read-only, via merge-tree) decides
  // whether to just do it or toast why we couldn't.
  async function runPullFromHost(inst: Instance): Promise<void> {
    if (!inst.branch) {
      store.setError(t((m) => m.toast.noBranchYet));
      return;
    }
    const worktreePath = inst.worktreePath();
    if (!worktreePath) {
      store.setError(t((m) => m.toast.pausedNeedResume));
      return;
    }
    const baseBranch = inst.baseBranch();
    if (!baseBranch) {
      store.setError(t((m) => m.toast.pullBlocked)(t((m) => m.blocker.noBaseBranch)));
      return;
    }
    try {
      const pre = await precheckPullFromHost(worktreePath, baseBranch);
      if (pre.blocker) {
        store.setError(t((m) => m.toast.pullBlocked)(formatBlocker(pre.blocker)));
        return;
      }
      if (pre.conflicts.length > 0) {
        store.setError(t((m) => m.toast.pullConflicts)(baseBranch, pre.conflicts.length));
        return;
      }
      inst.busy = true;
      store.bumpRev();
      try {
        await pullFromHost(
          worktreePath,
          baseBranch,
          makeCommitMessageProvider(props.config, 'pull'),
        );
        inst.busy = false;
        await inst.updateDiffBase().catch(() => undefined);
        await inst.computeCommitStats().catch(() => undefined);
        await inst.computeDiff().catch(() => undefined);
        store.bumpRev();
        store.setInfo(t((m) => m.toast.pulledFromHost)(baseBranch));
      } catch (err) {
        inst.busy = false;
        store.bumpRev();
        throw err;
      }
    } catch (err) {
      store.setError(t((m) => m.toast.pullFailed)(errMsg(err)));
    }
  }

  async function autoPullInstance(
    inst: Instance,
    worktreePath: string,
    baseBranch: string,
  ): Promise<void> {
    try {
      const pre = await precheckPullFromHost(worktreePath, baseBranch);
      if (pre.blocker || pre.conflicts.length > 0) {
        inst.autoPullFailedAt = Date.now();
        return;
      }
      inst.busy = true;
      store.bumpRev();
      await pullFromHost(worktreePath, baseBranch, makeCommitMessageProvider(props.config, 'pull'));
      inst.busy = false;
      inst.autoPullFailedAt = 0;
      await inst.updateDiffBase().catch(() => undefined);
      await inst.computeCommitStats().catch(() => undefined);
      await inst.computeDiff().catch(() => undefined);
      store.bumpRev();
    } catch {
      inst.autoPullFailedAt = Date.now();
      inst.busy = false;
      store.bumpRev();
    }
  }

  // ===== Apply (squash + retire) =====
  // Up-front precheck (read-only, via `merge-tree`) so the confirm overlay
  // only opens for actions that have a chance of succeeding. Apply has the
  // same conflict surface as a regular merge, so we reuse `precheckMerge`.
  async function openApplyFlow(index: number, inst: Instance): Promise<void> {
    if (!inst.branch) {
      store.setError(t((m) => m.toast.noBranchYet));
      return;
    }
    try {
      await inst.computeCommitStats().catch(() => undefined);
      if (inst.commitStats.ahead === 0 && !(await inst.isDirty().catch(() => false))) {
        store.setError(t((m) => m.toast.nothingToApply));
        return;
      }
      const hostBranch = await getHostBranch(props.repoPath);
      if (!hostBranch) {
        store.setError(t((m) => m.toast.applyBlocked)(formatBlocker({ kind: 'hostDetachedHead' })));
        return;
      }
      // Mirror `m`'s overlay: surface dirty state so the confirm message
      // can pre-announce the auto-commit instead of doing it silently.
      const [pre, dirty] = await Promise.all([
        precheckMerge(props.repoPath, inst.branch),
        inst.isDirty().catch(() => false),
      ]);
      if (pre.blocker) {
        store.setError(t((m) => m.toast.applyBlocked)(formatBlocker(pre.blocker)));
        return;
      }
      if (pre.conflicts.length > 0) {
        store.setError(t((m) => m.toast.applyConflicts)(hostBranch, pre.conflicts.length));
        return;
      }
      store.openConfirm({ kind: 'apply', index, hostBranch, dirty });
    } catch (err) {
      store.setError(t((m) => m.toast.applyFailed)(errMsg(err)));
    }
  }

  async function runApply(inst: Instance, hostBranch: string): Promise<void> {
    inst.busy = true;
    store.bumpRev();
    const autoCommitted = await inst.commitDirty(
      `[claudesquad] auto-commit on apply of ${inst.title}`,
      makeCommitMessageProvider(props.config, 'autoCommit'),
    );
    const message = `[claudesquad] squash apply from ${inst.title}`;
    await squashMergeIntoHost(
      props.repoPath,
      inst.branch,
      message,
      makeCommitMessageProvider(props.config, 'squashApply'),
    );
    inst.busy = false;
    try {
      await inst.kill();
      store.removeInstance(inst.title);
    } catch (err) {
      store.setError(t((m) => m.toast.cleanupFailed)(errMsg(err)));
      store.bumpRev();
      return;
    }
    store.setInfo(t((m) => m.toast.applied)(inst.branch, hostBranch, autoCommitted));
    await Promise.all(
      store.model.instances.map((i) => i.computeCommitStats().catch(() => undefined)),
    );
    store.bumpRev();
  }

  // Conflict path → fall back to the same flow the `c` key drives: pause
  // the instance and copy the branch name to the clipboard. The user then
  // resolves the merge manually wherever they want.
  async function handleMergeCheckout(): Promise<void> {
    const preview = store.model.mergePreview;
    if (!preview) return;
    const inst = store.model.instances[preview.index];
    store.closeOverlay();
    if (!inst) return;
    const p = inst.pause();
    store.bumpRev();
    try {
      await p;
      store.replaceInstance(inst);
      if (inst.branch) void writeClipboard(inst.branch).catch(() => undefined);
    } catch (err) {
      store.setError(errMsg(err));
      store.bumpRev();
    }
  }

  // Conflict path → build a natural-language prompt for the instance's
  // agent and stash it on the clipboard. The user pastes it into a fresh
  // session of their agent and lets it resolve the merge.
  async function handleCopyAgentPrompt(): Promise<void> {
    const preview = store.model.mergePreview;
    if (!preview) return;
    const agent = agentLabel(preview.program);
    const prompt = `${agent} "请把 ${preview.sourceBranch} 分支合并到 ${preview.hostBranch} 分支，如有冲突请逐文件帮我解决并解释每处取舍。"`;
    store.closeOverlay();
    const ok = await writeClipboard(prompt).catch(() => false);
    if (!ok) store.setError(t((m) => m.toast.clipboardCopyFailed));
  }

  // ===== Textarea key interception =====
  // The textarea owns most keys, so we hook onKeyDown to capture the keys
  // the surrounding prompt UI needs: Esc to cancel, ↑/↓ to navigate the
  // branch picker when one is visible, and Tab to cycle profiles when
  // multiple are configured.
  function onTextareaKey(e: { name: string; preventDefault(): void }): void {
    if (e.name === 'escape') {
      if (creatingInstance()) return;
      e.preventDefault();
      cancelInput();
      return;
    }
    if (store.model.state !== APP_STATE.Prompt) return;
    const branches = store.model.branchResults;
    if (branches.length > 0 && (e.name === 'up' || e.name === 'down')) {
      e.preventDefault();
      const cur = branches.indexOf(store.model.selectedBranch);
      const next =
        e.name === 'up'
          ? Math.max(0, cur < 0 ? 0 : cur - 1)
          : Math.min(branches.length - 1, cur < 0 ? 0 : cur + 1);
      store.selectBranch(branches[next]!);
      return;
    }
    if (e.name === 'tab' && profiles().length > 1) {
      e.preventDefault();
      const ps = profiles();
      const cur = ps.findIndex((p) => p.name === store.model.selectedProfile);
      const next = ps[(cur + 1 + ps.length) % ps.length]!;
      store.selectProfile(next.name);
    }
  }

  function cancelInput(): void {
    setInputValue('');
    nameTextareaRef?.setText('');
    nameTextareaRef?.blur();
    textareaRef?.blur();
    store.closeOverlay();
  }

  // ===== Submission =====
  async function submitInput(): Promise<void> {
    // Mirror opencode: re-read the textarea's native plainText right before
    // reading, so a still-composing IME character that hasn't reached the
    // onContentChange handler yet is captured.
    //
    // Send mode is dispatched directly from the overlay's onSubmit callback
    // (it owns its own textarea), so it doesn't pass through this function.
    if (store.model.state === APP_STATE.New) {
      const text = nameTextareaRef?.plainText ?? inputValue();
      await submitNewName(text);
    } else if (store.model.state === APP_STATE.Prompt) {
      const text = textareaRef?.plainText ?? inputValue();
      await submitPrompt(text);
    }
  }

  async function submitSendPrompt(rawPrompt: string): Promise<void> {
    const text = rawPrompt.trim();
    if (!text) {
      store.setError(t((m) => m.toast.sendEmpty));
      return;
    }
    const inst = selectedInstance();
    if (!inst || inst.isPaused() || !inst.hasStarted()) {
      store.setError(t((m) => m.toast.sendNotRunning));
      return;
    }
    try {
      // `sendPrompt` does send-keys -l <text> + sleep(100) + Enter — same
      // path the initial-prompt flow uses, so behaviour matches what the
      // agent sees on a fresh start.
      await inst.sendPrompt(text);
      // The overlay unmounts on closeOverlay() — its internal textarea
      // disappears with it, so no explicit reset is needed.
      store.closeOverlay();
    } catch (err) {
      store.setError(t((m) => m.toast.sendFailed)(errMsg(err)));
    }
  }

  async function submitNewName(rawName: string): Promise<void> {
    const input = rawName.trim();
    if (!input) {
      store.setError(t((m) => m.toast.nameRequired));
      return;
    }
    if (creatingInstance()) return;
    if (store.model.instances.some((i) => i.displayName === input)) {
      store.setError(t((m) => m.toast.nameExists)(input));
      return;
    }
    setCreatingInstance(true);
    try {
      const inst = await Instance.create({
        title: input,
        path: props.repoPath,
        program: defaultProgram(),
        branchPrefix: props.config.branch_prefix,
        projectID: props.projectID,
        autoYes: props.autoYes ?? props.config.auto_yes,
        llm: props.config.llm,
      });
      await inst.start(true);
      store.addInstance(inst);
      setInputValue('');
      nameTextareaRef?.setText('');
      nameTextareaRef?.blur();
      store.closeOverlay();
      maybeShowInstanceStartOnboarding(inst);
    } catch (err) {
      store.setError(errMsg(err));
    } finally {
      setCreatingInstance(false);
    }
  }

  async function submitPrompt(rawPrompt: string): Promise<void> {
    const text = rawPrompt.trim();
    if (!text) {
      store.setError(t((m) => m.toast.promptRequired));
      return;
    }
    const title = autoTitle(store.model.instances);
    const program =
      profiles().find((p) => p.name === store.model.selectedProfile)?.program ?? defaultProgram();
    try {
      const inst = await Instance.create({
        title,
        path: props.repoPath,
        program,
        branchPrefix: props.config.branch_prefix,
        projectID: props.projectID,
        autoYes: props.autoYes ?? props.config.auto_yes,
        branch: store.model.selectedBranch || undefined,
        prompt: text,
        llm: props.config.llm,
      });
      await inst.start(true);
      store.addInstance(inst);
      setInputValue('');
      textareaRef?.setText('');
      textareaRef?.blur();
      store.closeOverlay();
      maybeShowInstanceStartOnboarding(inst);
    } catch (err) {
      store.setError(errMsg(err));
    }
  }

  function maybeShowInstanceStartOnboarding(inst: Instance): void {
    if ((store.model.helpSeenMask & HELP_BIT_INSTANCE_START) !== 0) return;
    store.setPendingHelp({ kind: 'instance-start', instance: inst });
  }

  async function doAttach(inst: Instance): Promise<void> {
    // Grow tmux to the full terminal before handing off so the user sees
    // the agent at native size, not at the narrow preview-pane size.
    await inst.resizeTmux(dims().width, dims().height).catch(() => undefined);
    try {
      await props.onAttachRequest(inst);
    } catch (err) {
      store.setError(errMsg(err));
    } finally {
      // Back in the embedded preview — shrink tmux to match the preview pane.
      await inst.resizeTmux(previewCols(), previewRows()).catch(() => undefined);
      // The tmux session may have died while the user was attached (the
      // agent inside ran `exit`, or the user killed the window). Reconcile
      // status so the list stops showing a green "running" dot.
      await inst.checkAlive().catch(() => undefined);
      store.bumpRev();
    }
  }

  function dismissOnboarding(): void {
    const pending = store.model.pendingHelp;
    if (!pending) return;
    let bit: number;
    switch (pending.kind) {
      case 'attach':
        bit = HELP_BIT_INSTANCE_ATTACH;
        break;
      case 'instance-start':
        bit = HELP_BIT_INSTANCE_START;
        break;
      case 'checkout':
        bit = HELP_BIT_INSTANCE_CHECKOUT;
        break;
    }
    store.markHelpSeen(bit);
    void markHelpSeen(bit).catch(() => undefined);
    store.setPendingHelp(null);

    // After dismissing, run the action the overlay was gating.
    if (pending.kind === 'attach') void doAttach(pending.instance);
    else if (pending.kind === 'checkout')
      store.openConfirm({ kind: 'pause', index: pending.index });
    // instance-start is informational — no follow-up action.
  }

  async function handleConfirm(): Promise<void> {
    const action = store.model.confirmAction;
    if (!action) return;
    const inst = store.model.instances[action.index];
    if (!inst) {
      store.closeOverlay();
      return;
    }
    try {
      if (action.kind === 'kill') {
        await inst.kill();
        store.removeInstance(inst.title);
      } else if (action.kind === 'pause') {
        // Kick off pause then bumpRev *before* awaiting so the spinner
        // appears immediately — pause() sets Status.Loading synchronously
        // before its first await, so the bump captures it.
        const p = inst.pause();
        store.bumpRev();
        await p;
        store.replaceInstance(inst);
        // Mirror the Go version: stash the branch name on the clipboard so
        // the user can `git checkout` it elsewhere without re-typing.
        if (inst.branch) {
          void writeClipboard(inst.branch).catch(() => undefined);
        }
      } else if (action.kind === 'push') {
        await inst.pushChanges(`[claudesquad] push from ${inst.title}`, true);
      } else if (action.kind === 'apply') {
        await runApply(inst, action.hostBranch);
      }
    } catch (err) {
      if (action.kind === 'apply') {
        store.setError(t((m) => m.toast.applyFailed)(errMsg(err)));
      } else {
        store.setError(errMsg(err));
      }
    }
    // `pause()` / `kill()` / `pushChanges()` only mutate class fields on
    // the Instance (status, diffStats, …). Solid's createStore is blind
    // to those, so without a rev bump downstream memos like
    // `selectedPaused()` wouldn't re-evaluate — Preview kept the live
    // tail, Diff kept calling git on a worktree that was just deleted
    // and rendered the resulting "No such file or directory".
    store.bumpRev();
    store.closeOverlay();
  }

  // ===== Render =====
  const selectedInstance = createMemo(() => store.model.instances[store.model.selected] ?? null);
  // `isPaused()` reads a plain class field, so the memo also tracks `rev`
  // — that's the channel `replaceInstance` / `checkAlive` use to announce
  // status flips. Without the rev dep the preview/diff panes would not
  // re-render when the user pauses (checkout) the currently-selected row.
  const selectedPaused = createMemo(() => {
    void store.model.rev;
    return selectedInstance()?.isPaused() ?? false;
  });
  const selectedErrored = createMemo(() => {
    void store.model.rev;
    return selectedInstance()?.isError() ?? false;
  });
  // Tracks `rev` so the diff-stats badge on the Diff tab refreshes whenever
  // the metadata tick recomputes the selected instance's diff. Without the
  // explicit rev read, the property access alone doesn't trigger Solid.
  const selectedDiff = createMemo(() => {
    void store.model.rev;
    return selectedInstance()?.diffStats;
  });
  const menuMode = createMemo<MenuMode>(() => {
    if (store.model.state === APP_STATE.New) return 'new';
    if (store.model.state === APP_STATE.Prompt) return 'prompt';
    if (store.model.state === APP_STATE.Send) return 'send';
    if (store.model.instances.length === 0) return 'empty';
    if (selectedPaused()) return 'paused';
    return 'default';
  });
  const inputPlaceholder = createMemo(() => {
    if (store.model.state === APP_STATE.New) return t((m) => m.placeholder.newName);
    if (store.model.state === APP_STATE.Prompt) return t((m) => m.placeholder.prompt);
    return '';
  });

  const listWidth = createMemo(() => Math.max(30, Math.floor(dims().width * 0.32)));
  const overlayWidth = createMemo(() => Math.min(64, Math.max(40, Math.floor(dims().width * 0.5))));
  // HelpOverlay has more text per row (key column + description) and CJK
  // glyphs take 2 cells, so reuse of `overlayWidth` (sized for short
  // confirm/merge prompts) wraps mid-phrase. Widen it on its own track —
  // capped so a fullscreen terminal doesn't produce a cinema-strip
  // panel that's hard to scan.
  const helpOverlayWidth = createMemo(() =>
    Math.min(100, Math.max(60, Math.floor(dims().width * 0.7))),
  );

  // Estimated inner content dimensions of the Preview / Diff pane. Used to
  // resize the underlying tmux session so its captured rows match what the
  // viewport can actually display.
  //   - Right column outer width    = dims.width - listWidth
  //   - outer column padX           = 1 + 1 = 2
  //   - TabbedWindow border         = 1 + 1 = 2
  //   - TabbedWindow content padX   = 1 + 1 = 2
  //   - Preview inner padX          = 1 + 1 = 2
  //   ⇒ content cols                = (dims.width - listWidth) - 8
  //   - Right column outer height   = dims.height - 1 (menu)
  //   - tab strip (labels row + ━ underline row) = 2 rows
  //   - TabbedWindow content border = 1 + 1 = 2
  //   ⇒ stable chrome               = 1 + 2 + 2 = 5
  //   Footer rows are state-dependent and only added when actually rendered:
  //     - Prompt: input 1 (Esc/↵ live in the bottom Menu now)    = 1
  //     - New:    nothing (the inline NewInstanceRow lives in the list)
  //     - Idle:   nothing                                        = 0
  //   Sizing tmux to the real visible area avoids both bottom clipping
  //   (when chrome > tmux size) and blank padding rows (when tmux <
  //   visible area).
  const previewCols = createMemo(() => Math.max(20, dims().width - listWidth() - 8));
  const previewRows = createMemo(() => {
    const s = store.model.state;
    const footer = s === APP_STATE.Prompt ? 1 : 0;
    return Math.max(8, dims().height - 5 - footer);
  });

  // ===== Render =====
  //
  // Main UI is always mounted. Overlays sit on top as absolutely-positioned
  // siblings (zIndex 10) so the underlying List/Preview stays visible behind
  // the modal — the overlay body itself has a solid backgroundColor that
  // masks just the panel area. Previously the outer was `<Switch fallback>`,
  // which fully replaced the main UI while a modal was open and left the
  // rest of the screen blank.
  return (
    <box flexDirection="column" width={dims().width} height={dims().height}>
      <box flexDirection="row" flexGrow={1}>
        <InstanceList
          instances={store.model.instances}
          selectedIndex={store.model.selected}
          width={listWidth()}
          height={dims().height - 1}
          autoYes={props.autoYes ?? props.config.auto_yes}
          rev={store.model.rev}
          onSelect={(i) => store.select(i)}
          newInstanceRow={
            store.model.state === APP_STATE.New ? (
              <NewInstanceRow
                index={store.model.instances.length + 1}
                placeholder={t((m) => m.placeholder.newName)}
                loading={creatingInstance()}
                textareaRef={(r) => {
                  nameTextareaRef = r;
                }}
                onContentChange={() => setInputValue(nameTextareaRef?.plainText ?? '')}
                onSubmit={() => {
                  setTimeout(() => setTimeout(() => void submitInput(), 0), 0);
                }}
                onKeyDown={onTextareaKey}
              />
            ) : undefined
          }
        />
        <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} gap={0}>
          <TabbedWindow
            active={store.model.activeTab}
            hint={t((m) => m.tabs.switchHint)}
            diffStats={selectedDiff()}
            baseBranch={selectedInstance()?.baseBranch() || undefined}
            onTabClick={(id) => store.setTab(id)}
          >
            <Switch>
              <Match when={store.model.activeTab === 'preview'}>
                <Preview
                  instance={selectedInstance()}
                  paused={selectedPaused()}
                  errored={selectedErrored()}
                  width={previewCols()}
                  height={previewRows()}
                  scrollMode={store.model.scrollMode}
                  scrollOffset={store.model.scrollOffset}
                  onScroll={(d) => (d === 'up' ? store.scrollUp() : store.scrollDown())}
                  onScrollLimit={(m) => store.setScrollMax(m)}
                />
              </Match>
              <Match when={store.model.activeTab === 'diff'}>
                <Diff
                  instance={selectedInstance()}
                  paused={selectedPaused()}
                  height={previewRows()}
                  scrollMode={store.model.scrollMode}
                  scrollOffset={store.model.scrollOffset}
                  onScroll={(d) => (d === 'up' ? store.scrollUp() : store.scrollDown())}
                  onScrollLimit={(m) => store.setScrollMax(m)}
                />
              </Match>
            </Switch>
          </TabbedWindow>
          {/* Profile picker (only when in Prompt mode + multiple profiles) */}
          <Show when={store.model.state === APP_STATE.Prompt && profiles().length > 1}>
            <box flexDirection="row" flexShrink={0} gap={1}>
              <text fg={colors.muted}>program:</text>
              <For each={profiles()}>
                {(p) => {
                  const active = () =>
                    (store.model.selectedProfile || profiles()[0]?.name) === p.name;
                  return (
                    <text
                      fg={active() ? colors.accent : colors.muted}
                      attributes={active() ? 1 : 0}
                    >
                      {active() ? `[${p.name}]` : ` ${p.name} `}
                    </text>
                  );
                }}
              </For>
              <text fg={colors.muted}>(tab to cycle)</text>
            </box>
          </Show>

          {/* Input — only rendered when in Prompt mode. The New flow
           *  uses the inline NewInstanceRow inside the InstanceList,
           *  Send mode renders a modal overlay (so the right pane's
           *  height stays constant), and idle has nothing to type. */}
          <Show when={store.model.state === APP_STATE.Prompt}>
            <box flexDirection="row" flexShrink={0}>
              <text fg="cyan" attributes={1}>
                {'> '}
              </text>
              <textarea
                flexGrow={1}
                ref={(r) => {
                  textareaRef = r;
                }}
                placeholder={inputPlaceholder()}
                placeholderColor={colors.muted}
                focusedTextColor="white"
                textColor="white"
                focused={true}
                // Override OpenTUI's default (Enter → newline, Meta+Enter →
                // submit). For session names + prompts a plain Enter should
                // submit; Shift+Enter inserts an explicit newline if needed.
                keyBindings={SUBMIT_ON_ENTER_BINDINGS}
                onContentChange={() => setInputValue(textareaRef?.plainText ?? '')}
                onSubmit={() => {
                  // Defer twice so IME flushes the trailing composed character
                  // (opencode pattern). Without this the last pinyin char can
                  // be lost when submitting with Enter immediately.
                  setTimeout(() => setTimeout(() => void submitInput(), 0), 0);
                }}
                onKeyDown={onTextareaKey}
              />
            </box>
          </Show>

          {/* Branch picker (only when in Prompt mode) */}
          <Show when={store.model.state === APP_STATE.Prompt}>
            <box flexDirection="column" flexShrink={0}>
              <Show
                when={store.model.branchResults.length > 0}
                fallback={
                  <text fg={colors.muted}>
                    {store.model.branchFilter
                      ? '(no matching branches — will create new branch from HEAD)'
                      : '(blank → new branch from HEAD; type to search existing)'}
                  </text>
                }
              >
                <text fg={colors.muted}>branches (↑↓ to select):</text>
                <For each={store.model.branchResults.slice(0, 5)}>
                  {(b) => {
                    const active = () => b === store.model.selectedBranch;
                    return (
                      <box flexDirection="row">
                        <text fg={active() ? colors.accent : colors.muted}>
                          {active() ? '▶ ' : '  '}
                        </text>
                        <text fg={active() ? colors.accent : 'white'} wrapMode="none">
                          {b}
                        </text>
                      </box>
                    );
                  }}
                </For>
                <Show when={store.model.branchResults.length > 5}>
                  <text fg={colors.muted}>
                    {`  … +${store.model.branchResults.length - 5} more`}
                  </text>
                </Show>
              </Show>
            </box>
          </Show>

          {/* All mode-specific shortcuts (Esc cancel, ↵ submit/start,
           *  ? help) now live in the bottom Menu so we never spend a
           *  whole row on a hint that duplicates the menu line. */}
        </box>
      </box>
      <Menu mode={menuMode()} pressedKey={store.model.pressedKey} />

      {/* ===== tmux live-session indicator (footer right). =====
       *  Sits absolute so it never pushes the centered Menu off-axis. Shows
       *  the count of *our* tmux sessions (`claudesquad_*`) tmux currently
       *  reports alive — and, when non-zero, how many of them have no
       *  corresponding non-paused Instance (orphans the user likely forgot
       *  to kill). Orphan presence flips the colour to `warning` so it
       *  actually catches the eye. */}
      <box position="absolute" bottom={0} right={1} flexDirection="row" zIndex={4}>
        <text fg={tmuxOrphanCount() > 0 ? colors.warning : colors.muted}>
          {`tmux ${tmuxLiveCount()}${
            tmuxOrphanCount() > 0 ? ` (+${tmuxOrphanCount()} orphan)` : ''
          }`}
        </text>
      </box>

      {/* ===== Toast banners — float near the top, auto-dismiss. =====
       *  Horizontally centered, just below the header row so it lands in
       *  the user's eye-line without covering the bottom Menu or the
       *  list/preview content underneath. zIndex 5 keeps them under
       *  modal overlays (zIndex 10) — a modal should be the user's full
       *  attention, not share screen real-estate with a passing toast. */}
      <Show when={store.model.error || store.model.info}>
        <box
          position="absolute"
          top={3}
          left={0}
          width={dims().width}
          flexDirection="column"
          alignItems="center"
          gap={0}
          zIndex={5}
        >
          <Show when={store.model.error}>
            <ErrorBox
              message={store.model.error}
              width={Math.min(80, Math.floor(dims().width * 0.6))}
              onDismiss={() => store.setError(null)}
            />
          </Show>
          <Show when={store.model.info}>
            <ErrorBox
              message={store.model.info}
              kind="info"
              width={Math.min(80, Math.floor(dims().width * 0.6))}
              onDismiss={() => store.setInfo(null)}
            />
          </Show>
        </box>
      </Show>

      {/* ===== Modal overlays (absolute, masked by their own solid bg) ===== */}
      <Show when={store.model.state === APP_STATE.Confirm}>
        <box
          position="absolute"
          top={0}
          left={0}
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          <ConfirmationOverlay
            message={confirmMessage(store.model)}
            width={overlayWidth()}
            onConfirm={() => void handleConfirm()}
            onCancel={() => store.closeOverlay()}
          />
        </box>
      </Show>
      <Show when={store.model.state === APP_STATE.Help}>
        <box
          position="absolute"
          top={0}
          left={0}
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          <HelpOverlay width={helpOverlayWidth()} onClose={() => store.closeOverlay()} />
        </box>
      </Show>
      <Show when={store.model.state === APP_STATE.Tmux}>
        <box
          position="absolute"
          top={0}
          left={0}
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          <TmuxManagerOverlay
            entries={tmuxPanelEntries()}
            width={helpOverlayWidth()}
            onClose={() => store.closeOverlay()}
            onRefresh={() => void refreshTmuxInfos()}
            onKill={async (name) => {
              const ok = await killTmuxSession(name);
              if (ok) {
                store.setInfo(t((m) => m.toast.tmuxKilled)(name));
              } else {
                store.setError(t((m) => m.toast.tmuxKillFailed)(name));
              }
              await refreshTmuxInfos();
            }}
            onKillOrphans={async () => {
              const orphans = tmuxPanelEntries().filter(
                (e) => e.trackedTitle === null && e.foreignProject === null,
              );
              let killed = 0;
              for (const o of orphans) {
                // Sequential, not parallel: tmux's command socket
                // serialises anyway and a tight for-loop keeps the
                // toast count honest even if one kill happens to fail.
                if (await killTmuxSession(o.name)) killed++;
              }
              store.setInfo(t((m) => m.toast.tmuxKilledOrphans)(killed));
              await refreshTmuxInfos();
            }}
          />
        </box>
      </Show>
      <Show when={store.model.state === APP_STATE.Merge && store.model.mergePreview !== null}>
        <box
          position="absolute"
          top={0}
          left={0}
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          <MergeOverlay
            preview={store.model.mergePreview!}
            width={overlayWidth()}
            onConfirm={() => void handleMergeConfirm()}
            onCheckout={() => void handleMergeCheckout()}
            onCopyAgentPrompt={() => void handleCopyAgentPrompt()}
            onCancel={() => store.closeOverlay()}
          />
        </box>
      </Show>
      <Show when={store.model.pendingHelp !== null}>
        <box
          position="absolute"
          top={0}
          left={0}
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          {(() => {
            const ph = store.model.pendingHelp!;
            const inst = 'instance' in ph ? ph.instance : null;
            return (
              <OnboardingOverlay
                kind={ph.kind}
                data={inst ? { branch: inst.branch, program: inst.program } : undefined}
                width={overlayWidth()}
                onDismiss={dismissOnboarding}
              />
            );
          })()}
        </box>
      </Show>
      <Show when={store.model.state === APP_STATE.Send && selectedInstance() !== null}>
        <box
          position="absolute"
          top={0}
          left={0}
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          <SendPromptOverlay
            targetName={selectedInstance()?.displayName || selectedInstance()?.title || '?'}
            width={overlayWidth()}
            onSubmit={(text) => void submitSendPrompt(text)}
            onCancel={() => store.closeOverlay()}
          />
        </box>
      </Show>
    </box>
  );
}

function confirmMessage(model: ReturnType<typeof createAppStore>['model']): string {
  const action = model.confirmAction;
  if (!action) return '';
  const inst = model.instances[action.index];
  const name = inst?.displayName || inst?.title || '';
  switch (action.kind) {
    case 'kill':
      return t((m) => m.confirm.kill)(name);
    case 'pause':
      return t((m) => m.confirm.pause)(name);
    case 'push':
      return t((m) => m.confirm.push)(inst?.branch ?? '');
    case 'apply': {
      const base = t((m) => m.confirm.apply)(name, action.hostBranch);
      if (!action.dirty) return base;
      // Mirror the merge overlay: tell the user we'll commit pending
      // edits onto the instance branch before the squash, so the toast
      // afterwards isn't the first place they learn about it.
      const warn = t((m) => m.merge.dirtyWarn);
      const detail = t((m) => m.merge.dirtyDetail)(inst?.branch ?? '');
      return `${base}\n\n${warn}\n${detail}`;
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function autoTitle(instances: Instance[]): string {
  const base = 'session';
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!instances.some((inst) => inst.title === candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
