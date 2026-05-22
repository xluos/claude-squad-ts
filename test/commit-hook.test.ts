import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCommitMessageProvider } from '../src/session/git/commit-hook.js';
import { runGit } from '../src/session/git/exec.js';
import { mergeIntoHost, squashMergeIntoHost } from '../src/session/git/merge.js';
import type { AppConfig } from '../src/shared/types.js';

const baseCfg: AppConfig = {
  default_program: 'claude',
  auto_yes: false,
  daemon_poll_interval: 1000,
  branch_prefix: '',
};

function cfgWith(hooks: AppConfig['hooks']): AppConfig {
  return { ...baseCfg, hooks };
}

// ---- resolution / precedence (pure) --------------------------------------

test('no hooks config → no provider (keeps built-in message)', () => {
  expect(makeCommitMessageProvider(baseCfg, 'merge')).toBeUndefined();
});

test('general command applies to every point', () => {
  const cfg = cfgWith({ commit_message: { command: ['commitmsg'] } });
  expect(makeCommitMessageProvider(cfg, 'merge')).toBeDefined();
  expect(makeCommitMessageProvider(cfg, 'squashApply')).toBeDefined();
  expect(makeCommitMessageProvider(cfg, 'autoCommit')).toBeDefined();
  expect(makeCommitMessageProvider(cfg, 'sync')).toBeDefined();
});

test('per-point override can disable a single point', () => {
  const cfg = cfgWith({
    commit_message: { command: ['commitmsg'], overrides: { sync: { enabled: false } } },
  });
  expect(makeCommitMessageProvider(cfg, 'merge')).toBeDefined();
  expect(makeCommitMessageProvider(cfg, 'sync')).toBeUndefined();
});

test('override with no general command enables just that point', () => {
  const cfg = cfgWith({ commit_message: { overrides: { merge: { command: ['commitmsg'] } } } });
  expect(makeCommitMessageProvider(cfg, 'merge')).toBeDefined();
  expect(makeCommitMessageProvider(cfg, 'squashApply')).toBeUndefined();
});

test('general enabled:false is overridable back on per-point', () => {
  const cfg = cfgWith({
    commit_message: {
      command: ['commitmsg'],
      enabled: false,
      overrides: { merge: { enabled: true } },
    },
  });
  expect(makeCommitMessageProvider(cfg, 'merge')).toBeDefined();
  expect(makeCommitMessageProvider(cfg, 'sync')).toBeUndefined();
});

// ---- end-to-end against a real repo --------------------------------------

let dir: string;

async function git(...args: string[]): Promise<string> {
  const r = await runGit(['-C', dir, ...args]);
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cs-hook-'));
  await git('init', '-b', 'main');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await writeFile(join(dir, 'a.txt'), 'hello\n');
  await git('add', '.');
  await git('commit', '-m', 'init');
  // feature branch with a divergent change
  await git('checkout', '-b', 'feature');
  await writeFile(join(dir, 'b.txt'), 'feature work\n');
  await git('add', '.');
  await git('commit', '-m', 'feat: add b');
  await git('checkout', 'main');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// A hook that proves it ran *with the staged diff visible*: it emits the
// staged file list, which only works if changes are staged before it fires.
const stagedListHook = ['sh', '-c', 'echo "hooked: $(git diff --cached --name-only | tr \'\\n\' \',\')"'];

test('mergeIntoHost: hook message replaces the built-in one and sees staged diff', async () => {
  const cfg = cfgWith({ commit_message: { command: stagedListHook } });
  await mergeIntoHost(dir, 'feature', makeCommitMessageProvider(cfg, 'merge'));
  const subject = await git('log', '-1', '--pretty=%s');
  expect(subject).toBe('hooked: b.txt,');
  // It is a real merge commit (two parents).
  const parents = await git('log', '-1', '--pretty=%P');
  expect(parents.split(' ').length).toBe(2);
});

test('squashMergeIntoHost: hook message replaces the built-in one', async () => {
  const cfg = cfgWith({ commit_message: { command: stagedListHook } });
  await squashMergeIntoHost(dir, 'feature', '[claudesquad] squash', makeCommitMessageProvider(cfg, 'squashApply'));
  const subject = await git('log', '-1', '--pretty=%s');
  expect(subject).toBe('hooked: b.txt,');
  // Squash → single parent.
  const parents = await git('log', '-1', '--pretty=%P');
  expect(parents.split(' ').length).toBe(1);
});

test('failing hook aborts the merge and leaves the repo clean', async () => {
  const headBefore = await git('rev-parse', 'HEAD');
  const cfg = cfgWith({ commit_message: { command: ['sh', '-c', 'exit 3'] } });
  await expect(mergeIntoHost(dir, 'feature', makeCommitMessageProvider(cfg, 'merge'))).rejects.toThrow();
  // HEAD unmoved, no MERGE_HEAD, working tree clean.
  expect(await git('rev-parse', 'HEAD')).toBe(headBefore);
  const status = await git('status', '--porcelain');
  expect(status).toBe('');
  const mh = await runGit(['-C', dir, 'rev-parse', '--verify', '-q', 'MERGE_HEAD']);
  expect(mh.code).not.toBe(0);
});

test('empty-output hook aborts the squash and leaves the repo clean', async () => {
  const headBefore = await git('rev-parse', 'HEAD');
  const cfg = cfgWith({ commit_message: { command: ['sh', '-c', 'true'] } });
  await expect(
    squashMergeIntoHost(dir, 'feature', '[claudesquad] squash', makeCommitMessageProvider(cfg, 'squashApply')),
  ).rejects.toThrow();
  expect(await git('rev-parse', 'HEAD')).toBe(headBefore);
  expect(await git('status', '--porcelain')).toBe('');
});
