#!/usr/bin/env bun
import { Command } from 'commander';
import { runDaemon, stopDaemon } from '../daemon/daemon.js';
import { APP_NAME, APP_VERSION } from '../shared/constants.js';
import { initLogger, log } from '../shared/logger.js';
import { ensureAppDir } from '../shared/paths.js';
import { runDebug } from './commands/debug.js';
import { runReset } from './commands/reset.js';
import { runVersion } from './commands/version.js';
import { runTui } from './tui.js';

async function main(): Promise<number> {
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
  const code = process.exitCode;
  return typeof code === 'number' ? code : 0;
}

function formatErr(err: unknown): string {
  if (err instanceof Error) return `${APP_NAME}: ${err.message}`;
  return `${APP_NAME}: ${String(err)}`;
}

void main();
