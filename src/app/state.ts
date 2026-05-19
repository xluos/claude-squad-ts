import { createStore, produce } from 'solid-js/store';
import type { Instance } from '../session/instance.js';
import { APP_STATE, type AppStateValue } from '../shared/types.js';

export type TabId = 'preview' | 'diff';

export interface AppModel {
  instances: Instance[];
  selected: number;
  state: AppStateValue;
  activeTab: TabId;
  error: string | null;
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
}

export type PendingHelp =
  | { kind: 'attach'; instance: Instance }
  | { kind: 'instance-start'; instance: Instance }
  | { kind: 'checkout'; index: number };

export type ConfirmAction =
  | { kind: 'kill'; index: number }
  | { kind: 'pause'; index: number }
  | { kind: 'push'; index: number };

export const initialModel: AppModel = {
  instances: [],
  selected: 0,
  state: APP_STATE.Default,
  activeTab: 'preview',
  error: null,
  pressedKey: null,
  confirmAction: null,
  branchFilter: '',
  branchResults: [],
  selectedBranch: '',
  selectedProfile: '',
  rev: 0,
  helpSeenMask: 0,
  pendingHelp: null,
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
        }),
      );
    },
    removeInstance(title: string) {
      setModel(
        produce((m) => {
          m.instances = m.instances.filter((i) => i.title !== title);
          m.selected = clamp(m.selected, 0, Math.max(0, m.instances.length - 1));
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
      setModel('selected', clamp(idx, 0, Math.max(0, model.instances.length - 1)));
    },
    moveSelectionUp() {
      setModel('selected', clamp(model.selected - 1, 0, model.instances.length - 1));
    },
    moveSelectionDown() {
      setModel('selected', clamp(model.selected + 1, 0, model.instances.length - 1));
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
    closeOverlay() {
      setModel(
        produce((m) => {
          m.state = APP_STATE.Default;
          m.confirmAction = null;
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
  };
}

export type AppStore = ReturnType<typeof createAppStore>;
