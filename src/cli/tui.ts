import { createCliRenderer } from '@opentui/core';
import { render } from '@opentui/solid';
import { App } from '../app/App.js';
import { launchDaemon, stopDaemon } from '../daemon/daemon.js';
import { isGitRepo } from '../session/git/util.js';
import type { Instance } from '../session/instance.js';
import { attachTmux } from '../session/tmux/attach.js';
import { ensureDetachBinding } from '../session/tmux/tmux.js';
import { loadConfig } from '../shared/config.js';
import { resolveLang, setLang } from '../shared/i18n.js';
import { log } from '../shared/logger.js';

export interface TuiOpts {
  programOverride?: string;
  autoYes: boolean;
  /** Optional `--lang` CLI override. Takes precedence over `config.language`;
   *  unrecognised values are ignored and the config value wins. */
  langOverride?: string;
}

export async function runTui(opts: TuiOpts): Promise<void> {
  const repoPath = process.cwd();
  if (!(await isGitRepo(repoPath))) {
    throw new Error(`cwd is not a git repository: ${repoPath}`);
  }
  const config = await loadConfig();
  // Resolve UI language before any component mounts so the first paint is
  // already in the right language (no English-flash then re-render).
  // CLI `--lang` wins over config; both 'zh' | 'en' | 'auto' are accepted.
  const langSetting =
    opts.langOverride === 'zh' || opts.langOverride === 'en' || opts.langOverride === 'auto'
      ? opts.langOverride
      : config.language;
  setLang(resolveLang(langSetting));

  await stopDaemon();
  if (opts.autoYes) {
    process.on('beforeExit', () => {
      void launchDaemon();
    });
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    // Enable mouse so Preview/Diff can react to wheel events without
    // forcing users to remember Shift+↑/↓.
    useMouse: true,
  });

  /**
   * Attach handler.
   *
   * We want to hand the terminal off to `tmux attach-session` (which itself
   * uses the alternate screen, raw mode, and the mouse protocol) and come
   * back to the OpenTUI UI when the user detaches. OpenTUI exposes
   * `suspend()` / `resume()` exactly for this — suspend leaves the alt
   * screen, releases stdin raw mode, resets terminal background, etc.
   * Crucially, resume restores the same renderer + Solid tree, so the
   * App's reactive state isn't lost.
   *
   * NOTE: We do *not* call `renderer.destroy()` here. destroy is
   * permanent (frees native handles) and would force us to re-mount.
   */
  async function attachHandler(inst: Instance): Promise<void> {
    if (!(await inst.tmuxAlive())) {
      throw new Error(`tmux session for ${inst.title} is not alive`);
    }
    log.info(`attaching to tmux: ${inst.title}`);
    // Make sure the Ctrl+Q detach binding is set on the tmux server.
    // Sessions restored from state.json don't run TmuxSession.start(),
    // so we re-assert here. Idempotent and fast.
    await ensureDetachBinding();

    renderer.suspend();
    // Best-effort: redraw a clean screen for tmux. Suspend already drops
    // out of the alt screen buffer (which restores the original main
    // screen contents below), but tmux attach itself will re-enter alt
    // screen and overwrite. This explicit clear avoids a flash of stale
    // OpenTUI output if the terminal didn't auto-restore.
    process.stdout.write('\x1b[2J\x1b[H');

    try {
      const session = await attachTmux(`claudesquad_${sanitize(inst.title)}`);
      await session.done;
    } catch (err) {
      log.error('attach failed', err);
      throw err;
    } finally {
      // Give the terminal one tick to settle (tmux's exit sequence and our
      // resume can otherwise race for the alt-screen toggle).
      await sleep(20);
      renderer.resume();
    }
  }

  function onExit(): void {
    renderer.destroy();
    process.exit(0);
  }

  await render(
    () =>
      App({
        config,
        repoPath,
        programOverride: opts.programOverride,
        autoYes: opts.autoYes,
        onAttachRequest: attachHandler,
        onExit,
      }),
    renderer,
  );

  // Keep the process alive while the renderer runs. OpenTUI's render
  // returns once the Solid root has been set up; the renderer continues
  // its own loop on requestAnimationFrame-style scheduling. Calling
  // process.exit from onExit terminates the loop explicitly.
  await new Promise<void>((resolve) => {
    renderer.once('destroy', () => resolve());
  });
}

function sanitize(title: string): string {
  return title.replace(/\s+/g, '').replace(/\./g, '_');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
