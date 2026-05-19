import { render } from 'ink';
import React from 'react';
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

  // Stop any previous daemon; relaunch if autoYes requested.
  await stopDaemon();
  if (opts.autoYes) {
    process.on('beforeExit', () => {
      void launchDaemon();
    });
  }

  let app = mount();

  function mount(): ReturnType<typeof render> {
    return render(
      React.createElement(App, {
        config,
        repoPath,
        programOverride: opts.programOverride,
        autoYes: opts.autoYes,
        onAttachRequest: handleAttach,
      }),
      { exitOnCtrlC: false },
    );
  }

  async function handleAttach(instance: Instance): Promise<void> {
    if (!(await instance.tmuxAlive())) {
      throw new Error(`tmux session for ${instance.title} is not alive`);
    }
    // Unmount Ink so it releases stdin raw-mode.
    app.unmount();
    await app.waitUntilExit().catch(() => undefined);
    process.stdout.write('\x1b[2J\x1b[H'); // clear screen for tmux

    try {
      const session = await attachTmux(`claudesquad_${sanitize(instance.title)}`);
      await session.done;
    } finally {
      // Re-render Ink. New instance because the previous one has exited.
      app = mount();
    }
  }

  await app.waitUntilExit();
}

function sanitize(title: string): string {
  return title.replace(/\s+/g, '').replace(/\./g, '_');
}
