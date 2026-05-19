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
import { fetchPrune, searchBranches } from '../session/git/util.js';
import { Instance } from '../session/instance.js';
import { createStorage } from '../session/storage.js';
import { writeClipboard } from '../shared/clipboard.js';
import { effectiveProgram, getProfiles } from '../shared/config.js';
import {
  BRANCH_SEARCH_DEBOUNCE_MS,
  HELP_BIT_INSTANCE_ATTACH,
  HELP_BIT_INSTANCE_CHECKOUT,
  HELP_BIT_INSTANCE_START,
  MAX_INSTANCES,
  METADATA_TICK_MS,
} from '../shared/constants.js';
import { log } from '../shared/logger.js';
import { loadState, markHelpSeen } from '../shared/state.js';
import { colors } from '../shared/styles.js';
import type { AppConfig } from '../shared/types.js';
import { APP_STATE } from '../shared/types.js';
import { Diff } from '../ui/components/Diff.js';
import { ErrorBox } from '../ui/components/ErrorBox.js';
import { InstanceList } from '../ui/components/List.js';
import { Menu, type MenuMode } from '../ui/components/Menu.js';
import { Preview } from '../ui/components/Preview.js';
import { TabbedWindow } from '../ui/components/TabbedWindow.js';
import { ConfirmationOverlay } from '../ui/overlays/ConfirmationOverlay.js';
import { HelpOverlay } from '../ui/overlays/HelpOverlay.js';
import { OnboardingOverlay } from '../ui/overlays/OnboardingOverlay.js';
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
  programOverride?: string;
  autoYes?: boolean;
  onAttachRequest: (instance: Instance) => Promise<void>;
  onExit: () => void;
}

export function App(props: AppProps) {
  const store = createAppStore();
  const dims = useTerminalDimensions();
  const storage = createStorage();
  const profiles = createMemo(() => getProfiles(props.config));
  const defaultProgram = createMemo(() => props.programOverride ?? effectiveProgram(props.config));

  // Textarea state
  let textareaRef: TextareaRenderable | undefined;
  const [inputValue, setInputValue] = createSignal('');

  // ===== Persistence: restore + save =====
  onMount(async () => {
    try {
      const persisted = await loadState();
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
    } catch (err) {
      store.setError(errMsg(err));
    }
  });

  createEffect(() => {
    void storage.saveInstances(store.model.instances).catch((err) => log.error('save failed', err));
  });

  // ===== Periodic metadata refresh =====
  //
  // Each tick we (1) reconcile each instance's status with what tmux
  // actually reports, and (2) recompute diff stats. After mutations we
  // bump the model's `rev` counter so dependent Solid memos (which read
  // instance-internal class fields invisible to the store) re-evaluate.
  onMount(() => {
    const id = setInterval(() => {
      void (async () => {
        const insts = store.model.instances;
        let dirty = false;
        for (let i = 0; i < insts.length; i++) {
          const inst = insts[i]!;
          if (!inst.hasStarted()) continue;
          const prevStatus = inst.status;
          try {
            await inst.checkAlive();
          } catch {
            // ignore
          }
          if (inst.status !== prevStatus) dirty = true;
          if (inst.isPaused() || !inst.hasStarted()) continue;
          try {
            const prev = `${inst.diffStats.added}|${inst.diffStats.removed}`;
            if (i === store.model.selected) await inst.computeDiff();
            else await inst.computeDiffNumstat();
            const next = `${inst.diffStats.added}|${inst.diffStats.removed}`;
            if (prev !== next) dirty = true;
          } catch {
            // ignore transient git errors
          }
        }
        if (dirty) store.bumpRev();
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
    () => store.model.state === APP_STATE.New || store.model.state === APP_STATE.Prompt,
  );
  const modalOpen = createMemo(
    () => store.model.state === APP_STATE.Confirm || store.model.state === APP_STATE.Help,
  );

  useKeyboard((e) => {
    if (modalOpen() || inputFocused()) return;
    const name = e.name;
    const seq = e.sequence;

    if (e.ctrl && name === 'c') {
      props.onExit();
      return;
    }
    if (seq === 'q') {
      props.onExit();
      return;
    }
    if (seq === 'n') {
      if (store.model.instances.length >= MAX_INSTANCES) {
        store.setError(`instance limit reached (${MAX_INSTANCES})`);
        return;
      }
      store.setPressedKey('n');
      setInputValue('');
      store.openNewName();
      queueMicrotask(() => textareaRef?.focus());
      return;
    }
    if (seq === 'N') {
      if (store.model.instances.length >= MAX_INSTANCES) {
        store.setError(`instance limit reached (${MAX_INSTANCES})`);
        return;
      }
      store.setPressedKey('N');
      setInputValue('');
      store.openNewWithPrompt();
      queueMicrotask(() => textareaRef?.focus());
      return;
    }
    if (seq === '?') {
      store.openHelp();
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
        try {
          await selected.resume();
          store.replaceInstance(selected);
        } catch (err) {
          store.setError(errMsg(err));
        }
      })();
    }
  });

  // ===== Textarea key interception =====
  // The textarea owns most keys, so we hook onKeyDown to capture the keys
  // the surrounding prompt UI needs: Esc to cancel, ↑/↓ to navigate the
  // branch picker when one is visible, and Tab to cycle profiles when
  // multiple are configured.
  function onTextareaKey(e: { name: string; preventDefault(): void }): void {
    if (e.name === 'escape') {
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
    textareaRef?.blur();
    store.closeOverlay();
  }

  // ===== Submission =====
  async function submitInput(): Promise<void> {
    // Mirror opencode: re-read the textarea's native plainText right before
    // reading, so a still-composing IME character that hasn't reached the
    // onContentChange handler yet is captured.
    const text = textareaRef?.plainText ?? inputValue();
    if (store.model.state === APP_STATE.New) {
      await submitNewName(text);
    } else if (store.model.state === APP_STATE.Prompt) {
      await submitPrompt(text);
    }
  }

  async function submitNewName(rawName: string): Promise<void> {
    const input = rawName.trim();
    if (!input) {
      store.setError('name required');
      return;
    }
    if (store.model.instances.some((i) => i.displayName === input)) {
      store.setError(`instance "${input}" already exists`);
      return;
    }
    try {
      const inst = await Instance.create({
        title: input,
        path: props.repoPath,
        program: defaultProgram(),
        branchPrefix: props.config.branch_prefix,
        autoYes: props.autoYes ?? props.config.auto_yes,
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

  async function submitPrompt(rawPrompt: string): Promise<void> {
    const text = rawPrompt.trim();
    if (!text) {
      store.setError('prompt required');
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
    try {
      await props.onAttachRequest(inst);
    } catch (err) {
      store.setError(errMsg(err));
    } finally {
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
        await inst.pause();
        store.replaceInstance(inst);
        // Mirror the Go version: stash the branch name on the clipboard so
        // the user can `git checkout` it elsewhere without re-typing.
        if (inst.branch) {
          void writeClipboard(inst.branch).catch(() => undefined);
        }
      } else if (action.kind === 'push') {
        await inst.pushChanges(`[claudesquad] push from ${inst.title}`, true);
      }
    } catch (err) {
      store.setError(errMsg(err));
    }
    store.closeOverlay();
  }

  // ===== Render =====
  const selectedInstance = createMemo(() => store.model.instances[store.model.selected] ?? null);
  const menuMode = createMemo<MenuMode>(() => {
    if (store.model.state === APP_STATE.New) return 'new';
    if (store.model.state === APP_STATE.Prompt) return 'prompt';
    if (store.model.instances.length === 0) return 'empty';
    return 'default';
  });
  const inputPlaceholder = createMemo(() => {
    if (store.model.state === APP_STATE.New) return 'Name new session (中文也可)…';
    if (store.model.state === APP_STATE.Prompt) return 'Prompt for new session…';
    return '? for shortcuts';
  });

  const listWidth = createMemo(() => Math.max(30, Math.floor(dims().width * 0.32)));
  const overlayWidth = createMemo(() => Math.min(80, Math.max(40, Math.floor(dims().width * 0.7))));

  // Estimated inner content dimensions of the Preview / Diff pane. Used to
  // resize the underlying tmux session so its captured rows match what the
  // viewport can actually display.
  //   - Right column outer width  = dims.width - listWidth
  //   - right pane chrome         = 1 left border + 1 padX-left + 1 padX-right + 1 right border = 4
  //   - Preview inner padX        = 1 left + 1 right = 2
  //   ⇒ content cols              = (dims.width - listWidth) - 4 - 2
  //   - Right column outer height = dims.height - 1 (menu)
  //   - right pane chrome         = 1 border-top + 1 border-bot = 2
  //   - tab bar                   = 1 row
  //   - input row (single line + prompt prefix) ≈ 1
  //   - hint                      = 1
  //   ⇒ content rows              = (dims.height - 1) - 2 - 1 - 1 - 1
  const previewCols = createMemo(() => Math.max(20, dims().width - listWidth() - 6));
  const previewRows = createMemo(() => Math.max(8, dims().height - 6));

  // ====== Overlay-only branch ======
  return (
    <Switch
      fallback={
        // ===== Main UI =====
        <box flexDirection="column" width={dims().width} height={dims().height}>
          <box flexDirection="row" flexGrow={1}>
            <InstanceList
              instances={store.model.instances}
              selectedIndex={store.model.selected}
              width={listWidth()}
              height={dims().height - 1}
              autoYes={props.autoYes ?? props.config.auto_yes}
              rev={store.model.rev}
            />
            <box
              flexGrow={1}
              flexDirection="column"
              borderStyle="rounded"
              borderColor={colors.primary}
              paddingLeft={1}
              paddingRight={1}
              gap={0}
            >
              <TabbedWindow active={store.model.activeTab}>
                <Switch>
                  <Match when={store.model.activeTab === 'preview'}>
                    <Preview
                      instance={selectedInstance()}
                      width={previewCols()}
                      height={previewRows()}
                      scrollMode={store.model.scrollMode}
                      scrollOffset={store.model.scrollOffset}
                      onScroll={(d) => (d === 'up' ? store.scrollUp() : store.scrollDown())}
                    />
                  </Match>
                  <Match when={store.model.activeTab === 'diff'}>
                    <Diff
                      instance={selectedInstance()}
                      height={previewRows()}
                      scrollMode={store.model.scrollMode}
                      scrollOffset={store.model.scrollOffset}
                      onScroll={(d) => (d === 'up' ? store.scrollUp() : store.scrollDown())}
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

              {/* Input — always rendered; focused based on mode */}
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
                  focused={inputFocused()}
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

              <text fg={colors.muted}>
                {inputFocused() ? 'Esc to cancel · ↵ to submit' : '? for shortcuts'}
              </text>
            </box>
          </box>
          <Menu mode={menuMode()} pressedKey={store.model.pressedKey} />
          <Show when={store.model.error}>
            <ErrorBox
              message={store.model.error}
              width={Math.floor(dims().width * 0.9)}
              onDismiss={() => store.setError(null)}
            />
          </Show>
        </box>
      }
    >
      {/* ===== Centered modal overlays ===== */}
      <Match when={store.model.state === APP_STATE.Confirm}>
        <box
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
        >
          <ConfirmationOverlay
            message={confirmMessage(store.model)}
            width={overlayWidth()}
            onConfirm={() => void handleConfirm()}
            onCancel={() => store.closeOverlay()}
          />
        </box>
      </Match>
      <Match when={store.model.state === APP_STATE.Help}>
        <box
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
        >
          <HelpOverlay width={overlayWidth()} onClose={() => store.closeOverlay()} />
        </box>
      </Match>
      <Match when={store.model.pendingHelp !== null}>
        <box
          width={dims().width}
          height={dims().height}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
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
      </Match>
    </Switch>
  );
}

function confirmMessage(model: ReturnType<typeof createAppStore>['model']): string {
  const action = model.confirmAction;
  if (!action) return '';
  const inst = model.instances[action.index];
  const name = inst?.displayName || inst?.title;
  switch (action.kind) {
    case 'kill':
      return `Delete instance "${name}" and its worktree?`;
    case 'pause':
      return `Pause "${name}"? Worktree will be removed but branch kept.`;
    case 'push':
      return `Push branch "${inst?.branch}" to origin and open in browser?`;
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
