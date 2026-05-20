import { createStore, produce } from 'solid-js/store';
import type { MergeBlocker } from '../session/git/merge.js';
import type { Instance } from '../session/instance.js';
import { APP_STATE, type AppStateValue } from '../shared/types.js';

export type TabId = 'preview' | 'diff';

/**
 * Snapshot describing a merge that the user is being asked to confirm.
 * Built once when the user presses `m` so the overlay can render without
 * re-running git.
 */
export interface MergePreview {
  /** Index into `model.instances` of the source. */
  index: number;
  /** Branch we're proposing to merge from. */
  sourceBranch: string;
  /** Branch currently checked out in the host repo. */
  hostBranch: string;
  /** Host repo path (the cwd claude-squad was launched in). */
  hostPath: string;
  /** Conflicting file paths reported by `git merge-tree`. Empty when clean. */
  conflicts: string[];
  /** Set when precheck refused to run (dirty host, detached HEAD, ...). */
  blocker?: MergeBlocker;
  /** Source instance's program string — used to label the agent prompt option. */
  program: string;
  /** Worktree has uncommitted changes. Confirming the merge will
   *  auto-commit them to the source branch before running `git merge`,
   *  matching the auto-commit-on-pause behaviour. Surfaced in the
   *  overlay so the user knows that's about to happen. */
  dirty: boolean;
  /** When true, the instance is killed (tmux + worktree + branch
   *  removed) immediately after a successful merge. Triggered by
   *  capital `M` instead of lowercase `m`; surfaced in the overlay so
   *  the user can back out before two destructive ops run back-to-back. */
  killAfter: boolean;
}

export interface AppModel {
  instances: Instance[];
  selected: number;
  state: AppStateValue;
  activeTab: TabId;
  error: string | null;
  /** Transient success / info banner, auto-dismissed after a few seconds. */
  info: string | null;
  pressedKey: string | null;
  confirmAction: ConfirmAction | null;
  branchFilter: string;
  branchResults: string[];
  selectedBranch: string;
  selectedProfile: string;
  /**
   * Monotonic counter that bumps whenever an Instance's internal mutable
   * state changes (status, diffStats, etc.). Solid stores can't see field
   * mutations on class instances, so consumers that need to react to
   * instance-internal changes read this counter to force re-evaluation.
   */
  rev: number;
  /** Bitmask of help screens already shown to the user. Mirrors the Go
   *  version's `helpScreensSeen` so each contextual overlay shows once. */
  helpSeenMask: number;
  /** When set, the user just triggered an action that requires a one-time
   *  onboarding overlay before proceeding. */
  pendingHelp: PendingHelp | null;
  /** Active merge overlay payload (only meaningful while state === Merge). */
  mergePreview: MergePreview | null;
  /** Preview/Diff scroll state. While `scrollMode` is true, the active tab
   *  shows a frozen scrollback view that the user can move through with
   *  shift+↑/↓; Esc returns to the live tail. `scrollOffset` is number of
   *  lines scrolled up from the bottom (0 = pinned to bottom). */
  scrollMode: boolean;
  scrollOffset: number;
  /** Maximum scrollable offset for the active view, pushed by Preview/Diff
   *  whenever content/height changes. Lets `scrollUp` stop accumulating
   *  once the user has hit the top of the buffer instead of scrolling
   *  past it into empty space. 0 = nothing to scroll. */
  scrollMax: number;
}

export type PendingHelp =
  | { kind: 'attach'; instance: Instance }
  | { kind: 'instance-start'; instance: Instance }
  | { kind: 'checkout'; index: number };

export type ConfirmAction =
  | { kind: 'kill'; index: number }
  | { kind: 'pause'; index: number }
  | { kind: 'push'; index: number }
  | { kind: 'apply'; index: number; hostBranch: string };

export const initialModel: AppModel = {
  instances: [],
  selected: 0,
  state: APP_STATE.Default,
  activeTab: 'preview',
  error: null,
  info: null,
  pressedKey: null,
  confirmAction: null,
  branchFilter: '',
  branchResults: [],
  selectedBranch: '',
  selectedProfile: '',
  rev: 0,
  helpSeenMask: 0,
  pendingHelp: null,
  mergePreview: null,
  scrollMode: false,
  scrollOffset: 0,
  scrollMax: 0,
};

/**
 * Returns a SolidJS store + a strongly-typed dispatch helper for our limited
 * set of state transitions. Each handler mutates the store via `produce` to
 * keep mutations local and trackable.
 */
export function createAppStore() {
  const [model, setModel] = createStore<AppModel>(initialModel);

  function clamp(v: number, lo: number, hi: number): number {
    if (hi < lo) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  // scrollMode / scrollOffset are global UI state, not per-instance. When the
  // selected instance changes (new, switch, delete that shifts selection),
  // reset them so the new instance's Preview/Diff starts pinned to the bottom
  // / top instead of inheriting the previous instance's offset and hiding
  // content. `reorder*` deliberately doesn't call this — same instance, just
  // shifted in the list.
  function resetScroll(m: AppModel) {
    m.scrollMode = false;
    m.scrollOffset = 0;
    m.scrollMax = 0;
  }

  return {
    model,
    setInstances(instances: Instance[]) {
      setModel(
        produce((m) => {
          m.instances = instances;
          m.selected = clamp(m.selected, 0, Math.max(0, instances.length - 1));
        }),
      );
    },
    addInstance(instance: Instance) {
      setModel(
        produce((m) => {
          m.instances.push(instance);
          m.selected = m.instances.length - 1;
          resetScroll(m);
        }),
      );
    },
    removeInstance(title: string) {
      setModel(
        produce((m) => {
          const prev = m.selected;
          m.instances = m.instances.filter((i) => i.title !== title);
          m.selected = clamp(m.selected, 0, Math.max(0, m.instances.length - 1));
          if (m.selected !== prev) resetScroll(m);
        }),
      );
    },
    replaceInstance(instance: Instance) {
      setModel(
        produce((m) => {
          m.instances = m.instances.map((i) => (i.title === instance.title ? instance : i));
        }),
      );
    },
    select(idx: number) {
      const next = clamp(idx, 0, Math.max(0, model.instances.length - 1));
      if (next === model.selected) return;
      setModel(
        produce((m) => {
          m.selected = next;
          resetScroll(m);
        }),
      );
    },
    moveSelectionUp() {
      const next = clamp(model.selected - 1, 0, model.instances.length - 1);
      if (next === model.selected) return;
      setModel(
        produce((m) => {
          m.selected = next;
          resetScroll(m);
        }),
      );
    },
    moveSelectionDown() {
      const next = clamp(model.selected + 1, 0, model.instances.length - 1);
      if (next === model.selected) return;
      setModel(
        produce((m) => {
          m.selected = next;
          resetScroll(m);
        }),
      );
    },
    reorderUp() {
      if (model.selected <= 0) return;
      setModel(
        produce((m) => {
          const i = m.selected;
          const tmp = m.instances[i - 1]!;
          m.instances[i - 1] = m.instances[i]!;
          m.instances[i] = tmp;
          m.selected = i - 1;
        }),
      );
    },
    reorderDown() {
      if (model.selected >= model.instances.length - 1) return;
      setModel(
        produce((m) => {
          const i = m.selected;
          const tmp = m.instances[i + 1]!;
          m.instances[i + 1] = m.instances[i]!;
          m.instances[i] = tmp;
          m.selected = i + 1;
        }),
      );
    },
    openNewName() {
      setModel('state', APP_STATE.New);
    },
    openNewWithPrompt() {
      setModel(
        produce((m) => {
          m.state = APP_STATE.Prompt;
          m.branchFilter = '';
          m.branchResults = [];
          m.selectedBranch = '';
        }),
      );
    },
    /** Open the inline "send a line to the selected session" textarea. No
     *  branch / profile picker — we're just forwarding one prompt into an
     *  already-running tmux pane via `tmux send-keys`. */
    openSendPrompt() {
      setModel('state', APP_STATE.Send);
    },
    openConfirm(action: ConfirmAction) {
      setModel(
        produce((m) => {
          m.state = APP_STATE.Confirm;
          m.confirmAction = action;
        }),
      );
    },
    openHelp() {
      setModel('state', APP_STATE.Help);
    },
    openTmux() {
      setModel('state', APP_STATE.Tmux);
    },
    openMergeOverlay(preview: MergePreview) {
      setModel(
        produce((m) => {
          m.state = APP_STATE.Merge;
          m.mergePreview = preview;
        }),
      );
    },
    closeOverlay() {
      setModel(
        produce((m) => {
          m.state = APP_STATE.Default;
          m.confirmAction = null;
          m.mergePreview = null;
          m.branchFilter = '';
          m.branchResults = [];
          m.selectedBranch = '';
        }),
      );
    },
    cycleTab() {
      setModel('activeTab', model.activeTab === 'preview' ? 'diff' : 'preview');
    },
    setTab(tab: TabId) {
      setModel('activeTab', tab);
    },
    setError(msg: string | null) {
      setModel('error', msg);
    },
    setInfo(msg: string | null) {
      setModel('info', msg);
    },
    setPressedKey(key: string | null) {
      setModel('pressedKey', key);
    },
    setBranches(filter: string, results: string[]) {
      setModel(
        produce((m) => {
          m.branchFilter = filter;
          m.branchResults = results;
        }),
      );
    },
    selectBranch(name: string) {
      setModel('selectedBranch', name);
    },
    selectProfile(name: string) {
      setModel('selectedProfile', name);
    },
    /** Bumped after any class-instance mutation so dependent views can re-derive. */
    bumpRev() {
      setModel('rev', (r) => r + 1);
    },
    setHelpSeenMask(mask: number) {
      setModel('helpSeenMask', mask);
    },
    markHelpSeen(bit: number) {
      setModel('helpSeenMask', model.helpSeenMask | bit);
    },
    setPendingHelp(help: PendingHelp | null) {
      setModel('pendingHelp', help);
    },
    /** Move scroll one line up; entering scroll mode if not already.
     *  Gated by `scrollMax` (pushed by the active view) so we stop at the
     *  top of the buffer instead of scrolling past it into a blank pane. */
    scrollUp() {
      setModel(
        produce((m) => {
          if (!m.scrollMode) {
            // First press: switch into scroll mode. The view will switch
            // its source (live → history for Preview) and push the real
            // scrollMax on the next tick; later presses are then gated.
            m.scrollMode = true;
            m.scrollOffset = 1;
            return;
          }
          if (m.scrollOffset >= m.scrollMax) return;
          m.scrollOffset += 1;
        }),
      );
    },
    /** View-side hook: report the maximum scrollable offset for the
     *  currently rendered content + viewport. Called from Preview/Diff. */
    setScrollMax(max: number) {
      const next = Math.max(0, Math.floor(max));
      if (model.scrollMax === next) return;
      setModel('scrollMax', next);
    },
    /** Move scroll one line down; leaves scroll mode when reaching bottom. */
    scrollDown() {
      setModel(
        produce((m) => {
          if (m.scrollOffset <= 1) {
            m.scrollOffset = 0;
            m.scrollMode = false;
          } else {
            m.scrollOffset -= 1;
          }
        }),
      );
    },
    /** Exit scroll mode entirely (Esc handler). */
    exitScrollMode() {
      setModel(
        produce((m) => {
          m.scrollMode = false;
          m.scrollOffset = 0;
        }),
      );
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;
