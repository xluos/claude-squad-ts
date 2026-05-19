import { createCliRenderer } from '@opentui/core';
import { render } from '@opentui/solid';
import { App } from '../app/App.js';
import { launchDaemon, stopDaemon } from '../daemon/daemon.js';
import { isGitRepo } from '../session/git/util.js';
import type { Instance } from '../session/instance.js';
import { attachTmux } from '../session/tmux/attach.js';
import { loadConfig } from '../shared/config.js';

export interface TuiOpts {
  programOverride?: string;
  autoYes: boolean;
}

export async function runTui(opts: TuiOpts): Promise<void> {
  const repoPath = process.cwd();
  if (!(await isGitRepo(repoPath))) {
    throw new Error(`cwd is not a git repository: ${repoPath}`);
  }
  const config = await loadConfig();

  await stopDaemon();
  if (opts.autoYes) {
    process.on('beforeExit', () => {
      void launchDaemon();
    });
  }

  // Attach handler is intentionally async-fire-and-forget from the UI's
  // perspective: when invoked, it tears down the OpenTUI renderer, attaches
  // an interactive tmux session, then re-mounts the UI on detach.
  let detachAndRemount: ((inst: Instance) => Promise<void>) | null = null;

  async function attachHandler(inst: Instance): Promise<void> {
    if (!detachAndRemount) throw new Error('UI not yet mounted');
    await detachAndRemount(inst);
  }

  await mount();

  async function mount(): Promise<void> {
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      targetFps: 30,
    });

    detachAndRemount = async (inst: Instance) => {
      if (!(await inst.tmuxAlive())) {
        throw new Error(`tmux session for ${inst.title} is not alive`);
      }
      renderer.stop();
      renderer.destroy();
      process.stdout.write('\x1b[2J\x1b[H');

      try {
        const session = await attachTmux(`claudesquad_${sanitize(inst.title)}`);
        await session.done;
      } finally {
        await mount();
      }
    };

    await render(
      () =>
        App({
          config,
          repoPath,
          programOverride: opts.programOverride,
          autoYes: opts.autoYes,
          onAttachRequest: attachHandler,
          onExit: () => {
            renderer.stop();
            renderer.destroy();
            process.exit(0);
          },
        }),
      renderer,
    );
  }
}

function sanitize(title: string): string {
  return title.replace(/\s+/g, '').replace(/\./g, '_');
}
