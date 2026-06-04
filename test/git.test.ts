import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { runGit } from '../src/session/git/exec.js';
import { localBranchExists, sanitizeBranchName } from '../src/session/git/util.js';
import { worktreeFromData } from '../src/session/git/worktree.js';

test('sanitizeBranchName lowercases, replaces spaces, strips junk', () => {
  expect(sanitizeBranchName('My New Feature')).toBe('my-new-feature');
  // CJK chars + non-word punctuation are stripped, spaces become dashes, dashes are coalesced.
  expect(sanitizeBranchName('feat: 中文 / fix!')).toBe('feat-/-fix');
  expect(sanitizeBranchName('  --hello-- ')).toBe('hello');
});

test('worktree cleanup can preserve or delete the local branch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cs-worktree-cleanup-'));
  const repo = join(root, 'repo');
  try {
    await runGit(['init', repo]);
    await runGit(['-C', repo, 'checkout', '-b', 'main']);
    await runGit(['-C', repo, 'config', 'user.email', 'test@example.com']);
    await runGit(['-C', repo, 'config', 'user.name', 'Test User']);
    await Bun.write(join(repo, 'README.md'), 'base\n');
    await runGit(['-C', repo, 'add', 'README.md']);
    await runGit(['-C', repo, 'commit', '-m', 'initial']);
    const head = (await runGit(['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim();

    const keep = worktreeFromData({
      repo_path: repo,
      worktree_path: join(root, 'wt-keep'),
      session_name: 'keep',
      branch_name: 'feature/keep-branch',
      base_commit_sha: head,
      is_existing_branch: false,
    });
    await keep.setup();
    await keep.cleanup({ deleteBranch: false });
    expect(await localBranchExists(repo, 'feature/keep-branch')).toBe(true);

    const drop = worktreeFromData({
      repo_path: repo,
      worktree_path: join(root, 'wt-drop'),
      session_name: 'drop',
      branch_name: 'feature/drop-branch',
      base_commit_sha: head,
      is_existing_branch: false,
    });
    await drop.setup();
    await drop.cleanup({ deleteBranch: true });
    expect(await localBranchExists(repo, 'feature/drop-branch')).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
