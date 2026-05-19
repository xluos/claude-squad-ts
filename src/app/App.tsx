import { Box, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { fetchPrune, searchBranches } from '../session/git/util.js';
import { Instance } from '../session/instance.js';
import { createStorage } from '../session/storage.js';
import { effectiveProgram, getProfiles } from '../shared/config.js';
import { BRANCH_SEARCH_DEBOUNCE_MS, MAX_INSTANCES, METADATA_TICK_MS } from '../shared/constants.js';
import { log } from '../shared/logger.js';
import { colors } from '../shared/styles.js';
import type { AppConfig, Profile } from '../shared/types.js';
import { APP_STATE } from '../shared/types.js';
import { Diff } from '../ui/components/Diff.js';
import { ErrorBox } from '../ui/components/ErrorBox.js';
import { InstanceList } from '../ui/components/List.js';
import { Menu, type MenuMode } from '../ui/components/Menu.js';
import { Preview } from '../ui/components/Preview.js';
import { TabbedWindow } from '../ui/components/TabbedWindow.js';
import { useDebounced } from '../ui/hooks/useDebounced.js';
import { useInterval } from '../ui/hooks/useInterval.js';
import { useTerminalSize } from '../ui/hooks/useTerminalSize.js';
import { MultilineInput } from '../ui/input/MultilineInput.js';
import { ConfirmationOverlay } from '../ui/overlays/ConfirmationOverlay.js';
import { HelpOverlay } from '../ui/overlays/HelpOverlay.js';
import { type AppModel, initialModel, reduce } from './state.js';

export interface AppProps {
  config: AppConfig;
  repoPath: string;
  programOverride?: string;
  autoYes?: boolean;
  onAttachRequest: (instance: Instance) => Promise<void>;
}

const INPUT_ROWS = 3;

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

  // ===== Persistence: restore + save =====
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

  useEffect(() => {
    void storage.saveInstances(model.instances).catch((err) => log.error('save failed', err));
  }, [model.instances, storage]);

  // ===== Periodic diff refresh =====
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
            // transient errors are fine; UI will recover next tick
          }
        }
      })();
    },
    model.instances.length > 0 ? METADATA_TICK_MS : null,
  );

  // ===== Branch search (only while in prompt mode) =====
  const debouncedFilter = useDebounced(model.branchFilter, BRANCH_SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (model.state !== APP_STATE.Prompt) return;
    let cancelled = false;
    void (async () => {
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
  }, [debouncedFilter, model.state, repoPath, model.selectedBranch]);

  // ===== Layout =====
  const menuHeight = 1;
  const bodyHeight = Math.max(10, size.rows - menuHeight);
  const listWidth = Math.max(30, Math.floor(size.columns * 0.32));
  const rightWidth = Math.max(40, size.columns - listWidth);

  // Right pane composition (top → bottom inside its border):
  //   y=0: right-pane border-top
  //   y=1: tabs bar (1 row)
  //   y=2..K-1: content area (Preview / Diff, flex)
  //   y=K..K+inputBoxHeight-1: input box (border + INPUT_ROWS + border)
  //   y=K+inputBoxHeight: "? for shortcuts" hint
  //   y=bodyHeight-1: right-pane border-bottom
  //
  // The input is anchored to the bottom of the right pane so its position
  // is deterministic regardless of how much content the preview shows.
  const cursorAnchor = {
    x:
      listWidth /* right pane starts */ +
      1 /* right-pane border-left */ +
      1 /* right-pane padX-left */ +
      1 /* input border-left */ +
      1 /* input padX-left */,
    y: bodyHeight - 1 /* border-bottom */ - 1 /* hint */ - 1 /* input border-bottom */ - INPUT_ROWS,
  };

  const modalOpen = model.state === APP_STATE.Confirm || model.state === APP_STATE.Help;
  const inputMode: 'default' | 'new-name' | 'new-prompt' =
    model.state === APP_STATE.New
      ? 'new-name'
      : model.state === APP_STATE.Prompt
        ? 'new-prompt'
        : 'default';
  const inputFocused = inputMode !== 'default';

  // ===== Top-level key handling (default mode only) =====
  useInput(
    (input, key) => {
      if (modalOpen || inputFocused) return;
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
      if (input === 'd') {
        dispatch({ type: 'press-key', key: 'd' });
        dispatch({ type: 'open-confirm', action: { kind: 'kill', index: model.selected } });
        return;
      }
      if (input === 'c') {
        dispatch({ type: 'press-key', key: 'c' });
        dispatch({ type: 'open-confirm', action: { kind: 'pause', index: model.selected } });
        return;
      }
      if (input === 's') {
        dispatch({ type: 'press-key', key: 's' });
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
    { isActive: !modalOpen && !inputFocused },
  );

  // ===== Submit handlers (used by input field) =====
  const submitNewName = useCallback(
    async (name: string): Promise<void> => {
      const input = name.trim();
      if (!input) {
        dispatch({ type: 'error', message: 'name required' });
        return;
      }
      if (model.instances.some((i) => i.displayName === input)) {
        dispatch({ type: 'error', message: `instance "${input}" already exists` });
        return;
      }
      try {
        const inst = await Instance.create({
          title: input,
          path: repoPath,
          program: defaultProgram,
          branchPrefix: config.branch_prefix,
          autoYes: autoYes ?? config.auto_yes,
          llm: config.llm,
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
          llm: config.llm,
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

  // ===== Render =====

  // Modal mode: replace main UI with a centered overlay. These flows don't
  // need IME tracking so the simpler "swap the tree" approach is fine.
  if (modalOpen) {
    const overlayWidth = Math.min(80, Math.max(40, Math.floor(size.columns * 0.7)));
    return (
      <Box
        width={size.columns}
        height={size.rows}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        {model.state === APP_STATE.Confirm && (
          <ConfirmModalContent
            model={model}
            width={overlayWidth}
            onConfirm={() => void handleConfirm()}
            onCancel={() => dispatch({ type: 'close-overlay' })}
          />
        )}
        {model.state === APP_STATE.Help && (
          <HelpOverlay width={overlayWidth} onClose={() => dispatch({ type: 'close-overlay' })} />
        )}
      </Box>
    );
  }

  const selectedInstance = model.instances[model.selected] ?? null;
  const menuMode: MenuMode = menuModeFor(model);
  const inputPlaceholder =
    inputMode === 'new-name'
      ? 'Name new session (中文也可)…'
      : inputMode === 'new-prompt'
        ? 'Prompt for new session…'
        : '? for shortcuts';

  return (
    <Box flexDirection="column" width={size.columns} height={size.rows}>
      <Box flexDirection="row" height={bodyHeight}>
        <InstanceList
          instances={model.instances}
          selectedIndex={model.selected}
          width={listWidth}
          height={bodyHeight}
          autoYes={autoYes ?? config.auto_yes}
        />
        <Box
          flexDirection="column"
          width={rightWidth}
          height={bodyHeight}
          borderStyle="round"
          borderColor={colors.primary}
          paddingX={1}
        >
          <TabbedWindow
            active={model.activeTab}
            width={rightWidth - 4}
            height={bodyHeight - 2 - (INPUT_ROWS + 2) - 1}
          >
            {model.activeTab === 'preview' && (
              <Preview
                instance={selectedInstance}
                width={rightWidth - 4}
                height={bodyHeight - 2 - (INPUT_ROWS + 2) - 1 - 1}
              />
            )}
            {model.activeTab === 'diff' && (
              <Diff
                instance={selectedInstance}
                width={rightWidth - 4}
                height={bodyHeight - 2 - (INPUT_ROWS + 2) - 1 - 1}
              />
            )}
          </TabbedWindow>
          <MultilineInput
            width={rightWidth - 4}
            rows={INPUT_ROWS}
            bordered
            prefix="> "
            focus={inputFocused}
            placeholder={inputPlaceholder}
            cursorAnchor={cursorAnchor}
            onSubmit={(v) => {
              if (inputMode === 'new-name') void submitNewName(v);
              else if (inputMode === 'new-prompt') void submitPrompt(v);
            }}
            onCancel={() => dispatch({ type: 'close-overlay' })}
            onChange={(v) => {
              if (inputMode === 'new-prompt') {
                dispatch({ type: 'set-branches', filter: v, results: model.branchResults });
              }
            }}
          />
          <Box>
            <Text color={colors.muted}>
              {inputMode === 'default' ? '? for shortcuts' : 'Esc to cancel'}
            </Text>
          </Box>
        </Box>
      </Box>
      <Menu mode={menuMode} pressedKey={model.pressedKey} />
      {model.error && (
        <ErrorBox
          message={model.error}
          width={Math.floor(size.columns * 0.9)}
          onDismiss={() => dispatch({ type: 'error', message: null })}
        />
      )}
    </Box>
  );
}

interface ConfirmModalContentProps {
  model: AppModel;
  width: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModalContent({
  model,
  width,
  onConfirm,
  onCancel,
}: ConfirmModalContentProps): React.ReactElement {
  const action = model.confirmAction;
  const inst = action ? model.instances[action.index] : null;
  const name = inst?.displayName || inst?.title;
  const msg = action
    ? action.kind === 'kill'
      ? `Delete instance "${name}" and its worktree?`
      : action.kind === 'pause'
        ? `Pause "${name}"? Worktree will be removed but branch kept.`
        : `Push branch "${inst?.branch}" to origin and open in browser?`
    : '';
  return (
    <ConfirmationOverlay message={msg} width={width} onConfirm={onConfirm} onCancel={onCancel} />
  );
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

// Profile type referenced for unused warning suppression in IDE
export type { Profile };
