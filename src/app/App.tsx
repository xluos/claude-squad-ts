import { Box, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { fetchPrune, searchBranches } from '../session/git/util.js';
import { Instance } from '../session/instance.js';
import { createStorage } from '../session/storage.js';
import { effectiveProgram, getProfiles } from '../shared/config.js';
import { BRANCH_SEARCH_DEBOUNCE_MS, MAX_INSTANCES, METADATA_TICK_MS } from '../shared/constants.js';
import { log } from '../shared/logger.js';
import type { AppConfig, Profile } from '../shared/types.js';
import { APP_STATE } from '../shared/types.js';
import { Diff } from '../ui/components/Diff.js';
import { ErrorBox } from '../ui/components/ErrorBox.js';
import { InstanceList } from '../ui/components/List.js';
import { Menu, type MenuMode } from '../ui/components/Menu.js';
import { Preview } from '../ui/components/Preview.js';
import { TabbedWindow } from '../ui/components/TabbedWindow.js';
import { Terminal } from '../ui/components/Terminal.js';
import { useDebounced } from '../ui/hooks/useDebounced.js';
import { useInterval } from '../ui/hooks/useInterval.js';
import { useTerminalSize } from '../ui/hooks/useTerminalSize.js';
import { ConfirmationOverlay } from '../ui/overlays/ConfirmationOverlay.js';
import { HelpOverlay } from '../ui/overlays/HelpOverlay.js';
import { TextInputOverlay } from '../ui/overlays/TextInputOverlay.js';
import { type AppModel, initialModel, reduce } from './state.js';

export interface AppProps {
  config: AppConfig;
  repoPath: string;
  programOverride?: string;
  autoYes?: boolean;
  onAttachRequest: (instance: Instance) => Promise<void>;
}

export function App({
  config,
  repoPath,
  programOverride,
  autoYes,
  onAttachRequest,
}: AppProps): React.ReactElement {
  const [model, dispatch] = useReducer(reduce, initialModel);
  const { exit } = useApp();
  const size = useTerminalSize();
  const storage = useMemo(() => createStorage(), []);
  const profiles = useMemo(() => getProfiles(config), [config]);
  const defaultProgram = programOverride ?? effectiveProgram(config);

  // Load persisted instances + restore.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void (async () => {
      try {
        const loaded = await storage.loadInstances(config.branch_prefix);
        for (const inst of loaded) {
          if (!inst.isPaused()) {
            try {
              await inst.start(false);
            } catch (err) {
              log.warn(`failed to restore ${inst.title}`, err);
            }
          }
        }
        dispatch({ type: 'set-instances', instances: loaded });
      } catch (err) {
        dispatch({ type: 'error', message: errMsg(err) });
      }
    })();
  }, [config.branch_prefix, storage]);

  // Persist after any instance list change.
  useEffect(() => {
    void storage.saveInstances(model.instances).catch((err) => log.error('save failed', err));
  }, [model.instances, storage]);

  // Periodic diff numstat refresh for non-selected, full diff for selected.
  useInterval(
    () => {
      void (async () => {
        for (let i = 0; i < model.instances.length; i++) {
          const inst = model.instances[i]!;
          if (!inst.hasStarted() || inst.isPaused()) continue;
          try {
            if (i === model.selected) await inst.computeDiff();
            else await inst.computeDiffNumstat();
          } catch {
            // ignore transient git errors
          }
        }
      })();
    },
    model.instances.length > 0 ? METADATA_TICK_MS : null,
  );

  // Branch search (debounced) while in the prompt overlay.
  const debouncedFilter = useDebounced(model.branchFilter, BRANCH_SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (model.state !== APP_STATE.Prompt) return;
    let cancelled = false;
    void (async () => {
      // Best-effort prefetch first time.
      await fetchPrune(repoPath).catch(() => undefined);
      const results = await searchBranches(repoPath, debouncedFilter).catch(() => []);
      if (!cancelled) {
        dispatch({ type: 'set-branches', filter: debouncedFilter, results });
        if (results.length > 0 && !model.selectedBranch) {
          dispatch({ type: 'select-branch', name: results[0]! });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilter, model.state, repoPath]);

  // Global key handling — only active in default state. Overlays use their own useInput.
  useInput(
    (input, key) => {
      if (model.state !== APP_STATE.Default) return;
      if (input === 'q' || (key.ctrl && input === 'c')) {
        exit();
        return;
      }
      if (input === 'n') {
        if (model.instances.length >= MAX_INSTANCES) {
          dispatch({ type: 'error', message: `instance limit reached (${MAX_INSTANCES})` });
          return;
        }
        dispatch({ type: 'press-key', key: 'n' });
        dispatch({ type: 'open-new-name' });
        return;
      }
      if (input === 'N') {
        if (model.instances.length >= MAX_INSTANCES) {
          dispatch({ type: 'error', message: `instance limit reached (${MAX_INSTANCES})` });
          return;
        }
        dispatch({ type: 'press-key', key: 'N' });
        dispatch({ type: 'open-new-with-prompt' });
        return;
      }
      if (input === '?') {
        dispatch({ type: 'open-help' });
        return;
      }
      if (key.upArrow || input === 'k') {
        dispatch({ type: 'move-up' });
        return;
      }
      if (key.downArrow || input === 'j') {
        dispatch({ type: 'move-down' });
        return;
      }
      if (input === 'K') {
        dispatch({ type: 'reorder-up' });
        return;
      }
      if (input === 'J') {
        dispatch({ type: 'reorder-down' });
        return;
      }
      if (key.tab) {
        dispatch({ type: 'cycle-tab' });
        return;
      }
      const selected = model.instances[model.selected];
      if (!selected) return;
      if (key.return || input === 'o') {
        void onAttachRequest(selected).catch((err) => {
          dispatch({ type: 'error', message: errMsg(err) });
        });
        return;
      }
      if (input === 'D') {
        dispatch({ type: 'press-key', key: 'D' });
        dispatch({ type: 'open-confirm', action: { kind: 'kill', index: model.selected } });
        return;
      }
      if (input === 'c') {
        dispatch({ type: 'press-key', key: 'c' });
        dispatch({ type: 'open-confirm', action: { kind: 'pause', index: model.selected } });
        return;
      }
      if (input === 'p') {
        dispatch({ type: 'press-key', key: 'p' });
        dispatch({ type: 'open-confirm', action: { kind: 'push', index: model.selected } });
        return;
      }
      if (input === 'r') {
        dispatch({ type: 'press-key', key: 'r' });
        void (async () => {
          try {
            await selected.resume();
            dispatch({ type: 'replace-instance', instance: selected });
          } catch (err) {
            dispatch({ type: 'error', message: errMsg(err) });
          }
        })();
      }
    },
    { isActive: model.state === APP_STATE.Default },
  );

  const submitNewName = useCallback(
    async (name: string): Promise<void> => {
      const title = name.trim();
      if (!title) {
        dispatch({ type: 'error', message: 'name required' });
        return;
      }
      if (model.instances.some((i) => i.title === title)) {
        dispatch({ type: 'error', message: `instance "${title}" already exists` });
        return;
      }
      try {
        const inst = await Instance.create({
          title,
          path: repoPath,
          program: defaultProgram,
          branchPrefix: config.branch_prefix,
          autoYes: autoYes ?? config.auto_yes,
        });
        await inst.start(true);
        dispatch({ type: 'add-instance', instance: inst });
        dispatch({ type: 'close-overlay' });
      } catch (err) {
        dispatch({ type: 'error', message: errMsg(err) });
      }
    },
    [autoYes, config, defaultProgram, model.instances, repoPath],
  );

  const submitPrompt = useCallback(
    async (prompt: string): Promise<void> => {
      const text = prompt.trim();
      if (!text) {
        dispatch({ type: 'error', message: 'prompt required' });
        return;
      }
      const title = autoTitle(model.instances);
      const program =
        profiles.find((p) => p.name === model.selectedProfile)?.program ?? defaultProgram;
      try {
        const inst = await Instance.create({
          title,
          path: repoPath,
          program,
          branchPrefix: config.branch_prefix,
          autoYes: autoYes ?? config.auto_yes,
          branch: model.selectedBranch || undefined,
          prompt: text,
        });
        await inst.start(true);
        dispatch({ type: 'add-instance', instance: inst });
        dispatch({ type: 'close-overlay' });
      } catch (err) {
        dispatch({ type: 'error', message: errMsg(err) });
      }
    },
    [
      autoYes,
      config,
      defaultProgram,
      model.instances,
      model.selectedBranch,
      model.selectedProfile,
      profiles,
      repoPath,
    ],
  );

  const handleConfirm = useCallback(async (): Promise<void> => {
    const action = model.confirmAction;
    if (!action) return;
    const inst = model.instances[action.index];
    if (!inst) {
      dispatch({ type: 'close-overlay' });
      return;
    }
    try {
      if (action.kind === 'kill') {
        await inst.kill();
        dispatch({ type: 'remove-instance', title: inst.title });
      } else if (action.kind === 'pause') {
        await inst.pause();
        dispatch({ type: 'replace-instance', instance: inst });
      } else if (action.kind === 'push') {
        await inst.pushChanges(`[claudesquad] push from ${inst.title}`, true);
      }
    } catch (err) {
      dispatch({ type: 'error', message: errMsg(err) });
    }
    dispatch({ type: 'close-overlay' });
  }, [model.confirmAction, model.instances]);

  const listWidth = Math.max(20, Math.floor(size.columns * 0.3));
  const rightWidth = Math.max(20, size.columns - listWidth - 1);
  const bodyHeight = Math.max(8, size.rows - 4);

  const selectedInstance = model.instances[model.selected] ?? null;
  const menuMode: MenuMode = menuModeFor(model);

  return (
    <Box flexDirection="column" width={size.columns} height={size.rows}>
      <Box>
        <InstanceList
          instances={model.instances}
          selectedIndex={model.selected}
          width={listWidth}
          height={bodyHeight}
        />
        <TabbedWindow active={model.activeTab} width={rightWidth} height={bodyHeight}>
          {model.activeTab === 'preview' ? (
            <Preview instance={selectedInstance} width={rightWidth - 4} height={bodyHeight - 4} />
          ) : model.activeTab === 'diff' ? (
            <Diff instance={selectedInstance} width={rightWidth - 4} height={bodyHeight - 4} />
          ) : (
            <Terminal instance={selectedInstance} width={rightWidth - 4} height={bodyHeight - 4} />
          )}
        </TabbedWindow>
      </Box>
      <Menu mode={menuMode} pressedKey={model.pressedKey} />
      {model.error && (
        <ErrorBox
          message={model.error}
          width={Math.floor(size.columns * 0.9)}
          onDismiss={() => dispatch({ type: 'error', message: null })}
        />
      )}
      <ModalLayer
        model={model}
        size={size}
        profiles={profiles}
        onNewName={submitNewName}
        onPrompt={submitPrompt}
        onConfirm={handleConfirm}
        onClose={() => dispatch({ type: 'close-overlay' })}
        onBranchFilter={(filter) =>
          dispatch({ type: 'set-branches', filter, results: model.branchResults })
        }
        onBranchSelect={(name) => dispatch({ type: 'select-branch', name })}
        onProfileSelect={(name) => dispatch({ type: 'select-profile', name })}
      />
    </Box>
  );
}

interface ModalLayerProps {
  model: AppModel;
  size: { columns: number; rows: number };
  profiles: Profile[];
  onNewName: (name: string) => Promise<void>;
  onPrompt: (prompt: string) => Promise<void>;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  onBranchFilter: (filter: string) => void;
  onBranchSelect: (name: string) => void;
  onProfileSelect: (name: string) => void;
}

function ModalLayer({
  model,
  size,
  profiles,
  onNewName,
  onPrompt,
  onConfirm,
  onClose,
  onBranchSelect,
  onProfileSelect,
}: ModalLayerProps): React.ReactElement | null {
  const overlayWidth = Math.min(80, Math.max(40, Math.floor(size.columns * 0.7)));

  if (model.state === APP_STATE.New) {
    return (
      <Box paddingX={2} paddingY={1}>
        <TextInputOverlay
          title="New instance"
          placeholder="Name this session (a-z, 0-9, -)"
          width={overlayWidth}
          onSubmit={(v) => void onNewName(v)}
          onCancel={onClose}
        />
      </Box>
    );
  }
  if (model.state === APP_STATE.Prompt) {
    return (
      <Box paddingX={2} paddingY={1}>
        <TextInputOverlay
          title="New instance with prompt"
          placeholder="What should the agent do?"
          width={overlayWidth}
          profiles={profiles}
          selectedProfile={model.selectedProfile || profiles[0]?.name}
          onProfileChange={onProfileSelect}
          branches={model.branchResults}
          selectedBranch={model.selectedBranch}
          onBranchSelect={onBranchSelect}
          onSubmit={(v) => void onPrompt(v)}
          onCancel={onClose}
        />
      </Box>
    );
  }
  if (model.state === APP_STATE.Confirm) {
    const action = model.confirmAction;
    const inst = action ? model.instances[action.index] : null;
    const msg = action
      ? action.kind === 'kill'
        ? `Delete instance "${inst?.title}" and its worktree?`
        : action.kind === 'pause'
          ? `Pause "${inst?.title}"? Worktree will be removed but branch kept.`
          : `Push branch "${inst?.branch}" to origin and open in browser?`
      : '';
    return (
      <Box paddingX={2} paddingY={1}>
        <ConfirmationOverlay
          message={msg}
          width={overlayWidth}
          onConfirm={() => void onConfirm()}
          onCancel={onClose}
        />
      </Box>
    );
  }
  if (model.state === APP_STATE.Help) {
    return (
      <Box paddingX={2} paddingY={1}>
        <HelpOverlay width={overlayWidth} onClose={onClose} />
      </Box>
    );
  }
  return null;
}

function menuModeFor(model: AppModel): MenuMode {
  if (model.state === APP_STATE.New) return 'new';
  if (model.state === APP_STATE.Prompt) return 'prompt';
  if (model.instances.length === 0) return 'empty';
  return 'default';
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
