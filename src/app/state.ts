import type { Instance } from '../session/instance.js';
import { APP_STATE, type AppStateValue } from '../shared/types.js';
import type { TabId } from '../ui/components/TabbedWindow.js';

export interface AppModel {
  instances: Instance[];
  selected: number;
  state: AppStateValue;
  activeTab: TabId;
  error: string | null;
  pressedKey: string | null;

  // Modal-specific scratch
  confirmAction: ConfirmAction | null;
  promptMode: 'new-name' | 'new-with-prompt' | null;
  branchFilter: string;
  branchResults: string[];
  selectedBranch: string;
  selectedProfile: string;
}

export type ConfirmAction =
  | { kind: 'kill'; index: number }
  | { kind: 'pause'; index: number }
  | { kind: 'push'; index: number };

export type Action =
  | { type: 'select'; index: number }
  | { type: 'move-up' | 'move-down' }
  | { type: 'reorder-up' | 'reorder-down' }
  | { type: 'set-instances'; instances: Instance[] }
  | { type: 'add-instance'; instance: Instance }
  | { type: 'remove-instance'; title: string }
  | { type: 'replace-instance'; instance: Instance }
  | { type: 'open-new-name' }
  | { type: 'open-new-with-prompt' }
  | { type: 'open-confirm'; action: ConfirmAction }
  | { type: 'open-help' }
  | { type: 'close-overlay' }
  | { type: 'set-tab'; tab: TabId }
  | { type: 'cycle-tab' }
  | { type: 'error'; message: string | null }
  | { type: 'press-key'; key: string | null }
  | { type: 'set-branches'; filter: string; results: string[] }
  | { type: 'select-branch'; name: string }
  | { type: 'select-profile'; name: string };

export const initialModel: AppModel = {
  instances: [],
  selected: 0,
  state: APP_STATE.Default,
  activeTab: 'preview',
  error: null,
  pressedKey: null,
  confirmAction: null,
  promptMode: null,
  branchFilter: '',
  branchResults: [],
  selectedBranch: '',
  selectedProfile: '',
};

export function reduce(model: AppModel, action: Action): AppModel {
  switch (action.type) {
    case 'select':
      return {
        ...model,
        selected: clamp(action.index, 0, Math.max(0, model.instances.length - 1)),
      };
    case 'move-up':
      return { ...model, selected: clamp(model.selected - 1, 0, model.instances.length - 1) };
    case 'move-down':
      return { ...model, selected: clamp(model.selected + 1, 0, model.instances.length - 1) };
    case 'reorder-up': {
      const i = model.selected;
      if (i <= 0) return model;
      const next = [...model.instances];
      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
      return { ...model, instances: next, selected: i - 1 };
    }
    case 'reorder-down': {
      const i = model.selected;
      if (i < 0 || i >= model.instances.length - 1) return model;
      const next = [...model.instances];
      [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
      return { ...model, instances: next, selected: i + 1 };
    }
    case 'set-instances':
      return {
        ...model,
        instances: action.instances,
        selected: clamp(model.selected, 0, Math.max(0, action.instances.length - 1)),
      };
    case 'add-instance':
      return {
        ...model,
        instances: [...model.instances, action.instance],
        selected: model.instances.length,
      };
    case 'remove-instance': {
      const next = model.instances.filter((i) => i.title !== action.title);
      return {
        ...model,
        instances: next,
        selected: clamp(model.selected, 0, Math.max(0, next.length - 1)),
      };
    }
    case 'replace-instance': {
      const next = model.instances.map((i) =>
        i.title === action.instance.title ? action.instance : i,
      );
      return { ...model, instances: next };
    }
    case 'open-new-name':
      return { ...model, state: APP_STATE.New, promptMode: 'new-name' };
    case 'open-new-with-prompt':
      return {
        ...model,
        state: APP_STATE.Prompt,
        promptMode: 'new-with-prompt',
        branchFilter: '',
        branchResults: [],
        selectedBranch: '',
      };
    case 'open-confirm':
      return { ...model, state: APP_STATE.Confirm, confirmAction: action.action };
    case 'open-help':
      return { ...model, state: APP_STATE.Help };
    case 'close-overlay':
      return {
        ...model,
        state: APP_STATE.Default,
        promptMode: null,
        confirmAction: null,
        branchFilter: '',
        branchResults: [],
        selectedBranch: '',
      };
    case 'set-tab':
      return { ...model, activeTab: action.tab };
    case 'cycle-tab':
      return { ...model, activeTab: nextTabId(model.activeTab) };
    case 'error':
      return { ...model, error: action.message };
    case 'press-key':
      return { ...model, pressedKey: action.key };
    case 'set-branches':
      return { ...model, branchFilter: action.filter, branchResults: action.results };
    case 'select-branch':
      return { ...model, selectedBranch: action.name };
    case 'select-profile':
      return { ...model, selectedProfile: action.name };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function nextTabId(tab: 'preview' | 'diff'): 'preview' | 'diff' {
  return tab === 'preview' ? 'diff' : 'preview';
}
