#!/usr/bin/env bun

// IMPORTANT — read before reordering imports.
//
// OpenTUI's Solid JSX is transformed at *load time* by a Bun plugin
// (babel-preset-solid). The plugin has to be registered before any .tsx
// file is parsed, otherwise Bun's built-in JSX transform fires first and
// the file ends up with an `import "react/jsx-dev-runtime"` that we don't
// have.
//
// ESM resolves the entire static module graph before evaluating any code,
// so a static `import "@opentui/solid/preload"` at the top of *this* file
// is too late — Bun already parsed App.tsx by then.
//
// We work around this by importing the plugin synchronously (which is .ts,
// no JSX, so it's safe) and only then *dynamically* importing the rest of
// the CLI. The dynamic import resolves its module graph at runtime, after
// the plugin is registered.
import { ensureSolidTransformPlugin } from '@opentui/solid/bun-plugin';

ensureSolidTransformPlugin();

await runMain();

async function runMain(): Promise<void> {
  const [
    { Command },
    { runDaemon, stopDaemon },
    { APP_NAME, APP_VERSION },
    { initLogger, log },
    { ensureAppDir },
    { runDebug },
    { runReset },
    { runVersion },
    { runTui },
  ] = await Promise.all([
    import('commander'),
    import('../daemon/daemon.js'),
    import('../shared/constants.js'),
    import('../shared/logger.js'),
    import('../shared/paths.js'),
    import('./commands/debug.js'),
    import('./commands/reset.js'),
    import('./commands/version.js'),
    import('./tui.js'),
  ]);

  await ensureAppDir();
  await initLogger({ daemon: process.argv.includes('daemon') });

  const program = new Command();
  program
    .name('cs')
    .description('claude-squad-ts — multi-Claude session manager (TS rewrite)')
    .version(APP_VERSION, '-v, --version', 'show version');

  program
    .option('-p, --program <command>', 'program to run (overrides config)')
    .option('-y, --autoyes', 'auto-accept agent prompts', false)
    .action(async (opts: { program?: string; autoyes?: boolean }) => {
      try {
        await runTui({ programOverride: opts.program, autoYes: opts.autoyes ?? false });
      } catch (err) {
        log.error('tui failed', err);
        process.stderr.write(`${formatErr(err)}\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('reset')
    .description('delete all stored instances, cleanup tmux sessions and worktrees')
    .action(async () => {
      try {
        await runReset();
      } catch (err) {
        process.stderr.write(`${formatErr(err)}\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('debug')
    .description('print config paths and resolved config in JSON')
    .action(async () => {
      try {
        await runDebug();
      } catch (err) {
        process.stderr.write(`${formatErr(err)}\n`);
        process.exitCode = 1;
      }
    });

  program
    .command('version')
    .description('print version and project URL')
    .action(() => runVersion());

  program
    .command('daemon')
    .description('[internal] run autoyes daemon')
    .action(async () => {
      try {
        await runDaemon();
      } catch (err) {
        log.error('daemon failed', err);
        process.exitCode = 1;
      }
    });

  program
    .command('daemon:stop')
    .description('stop the running autoyes daemon')
    .action(async () => {
      await stopDaemon();
    });

  await program.parseAsync(process.argv);

  function formatErr(err: unknown): string {
    if (err instanceof Error) return `${APP_NAME}: ${err.message}`;
    return `${APP_NAME}: ${String(err)}`;
  }
}
