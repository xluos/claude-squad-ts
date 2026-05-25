import { spawn } from 'node:child_process';
import { log } from '../../shared/logger.js';
import type { AppConfig, CommitPoint } from '../../shared/types.js';
import { runGit } from './exec.js';

/** A resolved, runnable hook for one commit point. */
interface ResolvedHook {
  command: string[];
  /** seconds */
  timeout: number;
}

/**
 * A commit-message provider handed to the git layer. Called *after* the
 * change is staged and *before* the commit, with cwd = the repo/worktree
 * being committed and the built-in message as `fallback`. Returns the
 * message to commit with. Rejecting aborts the operation — the git layer
 * unwinds (merge --abort / reset) and the caller surfaces the error.
 */
export type CommitMessageProvider = (cwd: string, fallback: string) => Promise<string>;

/**
 * Merge the general `commit_message` hook with the per-point override for
 * `point`. Override fields win; `enabled` defaults to true when a command
 * is present. Returns null when no usable hook applies (no command, or
 * explicitly disabled) — callers then keep the built-in message.
 */
function resolveCommitHook(cfg: AppConfig, point: CommitPoint): ResolvedHook | null {
  const general = cfg.hooks?.commit_message;
  if (!general) return null;
  const ov = general.overrides?.[point];
  const command = ov?.command ?? general.command;
  if (!command || command.length === 0) return null;
  const enabled = ov?.enabled ?? general.enabled ?? true;
  if (!enabled) return null;
  const timeout = ov?.timeout ?? general.timeout ?? 30;
  return { command, timeout: timeout > 0 ? timeout : 30 };
}

/**
 * Build a `CommitMessageProvider` for `point`, or undefined when no hook is
 * configured — in which case the git layer stays on its original one-shot
 * `git commit -m <built-in>` path with zero behavioural change.
 */
export function makeCommitMessageProvider(
  cfg: AppConfig,
  point: CommitPoint,
): CommitMessageProvider | undefined {
  const hook = resolveCommitHook(cfg, point);
  if (!hook) return undefined;
  return async (cwd, fallback) => {
    const diff = await runGit(['-C', cwd, 'diff', '--cached', '--quiet']);
    if (diff.code === 0) {
      log.info(`skip commit-message hook for ${point}: staging area is empty`);
      return fallback;
    }
    return runCommitHook(hook, cwd, point);
  };
}

function runCommitHook(hook: ResolvedHook, cwd: string, point: CommitPoint): Promise<string> {
  const [cmd, ...args] = hook.command;
  log.info(`running commit-message hook for ${point}: ${hook.command.join(' ')} (cwd=${cwd})`);
  return new Promise<string>((resolve, reject) => {
    if (!cmd) {
      reject(new Error('commit-message hook has an empty command'));
      return;
    }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    } catch (err) {
      reject(new Error(`commit-message hook failed to start (${cmd}): ${(err as Error).message}`));
      return;
    }
    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() =>
        reject(new Error(`commit-message hook (${cmd}) timed out after ${hook.timeout}s`)),
      );
    }, hook.timeout * 1000);
    timer.unref?.();
    child.stdout?.on('data', (b: Buffer) => out.push(b));
    child.stderr?.on('data', (b: Buffer) => errOut.push(b));
    child.on('error', (err) =>
      finish(() =>
        reject(new Error(`commit-message hook failed to start (${cmd}): ${err.message}`)),
      ),
    );
    child.on('close', (code) =>
      finish(() => {
        if (code !== 0) {
          const detail = Buffer.concat(errOut).toString('utf8').trim();
          reject(
            new Error(`commit-message hook (${cmd}) exited ${code}${detail ? `: ${detail}` : ''}`),
          );
          return;
        }
        const msg = Buffer.concat(out).toString('utf8').trim();
        if (!msg) {
          reject(new Error(`commit-message hook (${cmd}) produced no output`));
          return;
        }
        resolve(msg);
      }),
    );
  });
}
