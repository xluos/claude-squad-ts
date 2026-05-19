import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { worktreesRoot } from '../../shared/paths.js';
import type { DiffStats, WorktreeData } from '../../shared/types.js';
import { computeDiff, computeDiffNumstat } from './diff.js';
import { ensureOk, runCmd, runGit } from './exec.js';
import {
  ensureGhAuthed,
  findRepoRoot,
  getHeadSha,
  localBranchExists,
  remoteBranchExists,
  sanitizeBranchName,
} from './util.js';

export interface WorktreeInit {
  repoPath: string;
  sessionName: string;
  branchPrefix: string;
}

export interface Worktree {
  data: WorktreeData;
  setup(): Promise<void>;
  cleanup(): Promise<void>;
  remove(): Promise<void>;
  prune(): Promise<void>;
  diff(): Promise<DiffStats>;
  diffNumstat(): Promise<DiffStats>;
  isDirty(): Promise<boolean>;
  isValid(): Promise<boolean>;
  isBranchCheckedOut(): Promise<boolean>;
  commit(msg: string): Promise<void>;
  pushAndOpen(msg: string, open: boolean): Promise<void>;
}

export async function createWorktree(init: WorktreeInit): Promise<Worktree> {
  const repoPath = await findRepoRoot(init.repoPath);
  const branchName = `${init.branchPrefix}${sanitizeBranchName(init.sessionName)}`;
  return buildWorktree({
    repo_path: repoPath,
    worktree_path: makeWorktreePath(init.sessionName),
    session_name: init.sessionName,
    branch_name: branchName,
    base_commit_sha: '',
    is_existing_branch: false,
  });
}

export async function createWorktreeFromBranch(
  repoPath: string,
  branchName: string,
  sessionName: string,
): Promise<Worktree> {
  const repo = await findRepoRoot(repoPath);
  return buildWorktree({
    repo_path: repo,
    worktree_path: makeWorktreePath(sessionName),
    session_name: sessionName,
    branch_name: branchName,
    base_commit_sha: '',
    is_existing_branch: true,
  });
}

export function worktreeFromData(data: WorktreeData): Worktree {
  return buildWorktree({ ...data });
}

function makeWorktreePath(sessionName: string): string {
  const safe = sanitizeBranchName(sessionName) || 'session';
  return join(worktreesRoot(), `${safe}_${Date.now()}`);
}

function buildWorktree(data: WorktreeData): Worktree {
  const self: Worktree = {
    data,

    async setup(): Promise<void> {
      // Always cleanup any leftover at the path first.
      await safeRemoveWorktree(data.worktree_path);
      if (existsSync(data.worktree_path)) {
        await rm(data.worktree_path, { recursive: true, force: true });
      }

      if (data.is_existing_branch) {
        const hasLocal = await localBranchExists(data.repo_path, data.branch_name);
        const hasRemote = await remoteBranchExists(data.repo_path, data.branch_name);
        if (!hasLocal && hasRemote) {
          ensureOk(
            'git',
            [
              'worktree',
              'add',
              '-b',
              data.branch_name,
              data.worktree_path,
              `origin/${data.branch_name}`,
            ],
            await runGit([
              '-C',
              data.repo_path,
              'worktree',
              'add',
              '-b',
              data.branch_name,
              data.worktree_path,
              `origin/${data.branch_name}`,
            ]),
          );
        } else {
          ensureOk(
            'git',
            ['worktree', 'add', data.worktree_path, data.branch_name],
            await runGit([
              '-C',
              data.repo_path,
              'worktree',
              'add',
              data.worktree_path,
              data.branch_name,
            ]),
          );
        }
        data.base_commit_sha = await getHeadSha(data.worktree_path);
      } else {
        // New branch from HEAD
        if (await localBranchExists(data.repo_path, data.branch_name)) {
          await runGit(['-C', data.repo_path, 'branch', '-D', data.branch_name]);
        }
        data.base_commit_sha = await getHeadSha(data.repo_path);
        ensureOk(
          'git',
          ['worktree', 'add', '-b', data.branch_name, data.worktree_path, data.base_commit_sha],
          await runGit([
            '-C',
            data.repo_path,
            'worktree',
            'add',
            '-b',
            data.branch_name,
            data.worktree_path,
            data.base_commit_sha,
          ]),
        );
      }
    },

    async cleanup(): Promise<void> {
      await safeRemoveWorktree(data.worktree_path);
      if (!data.is_existing_branch) {
        await runGit(['-C', data.repo_path, 'branch', '-D', data.branch_name]);
      }
      await runGit(['-C', data.repo_path, 'worktree', 'prune']);
    },

    async remove(): Promise<void> {
      await safeRemoveWorktree(data.worktree_path);
    },

    async prune(): Promise<void> {
      await runGit(['-C', data.repo_path, 'worktree', 'prune']);
    },

    diff(): Promise<DiffStats> {
      return computeDiff(data.worktree_path, data.base_commit_sha);
    },

    diffNumstat(): Promise<DiffStats> {
      return computeDiffNumstat(data.worktree_path, data.base_commit_sha);
    },

    async isDirty(): Promise<boolean> {
      const r = await runGit(['-C', data.worktree_path, 'status', '--porcelain']);
      return r.code === 0 && r.stdout.trim().length > 0;
    },

    async isValid(): Promise<boolean> {
      return existsSync(data.worktree_path) && existsSync(join(data.worktree_path, '.git'));
    },

    async isBranchCheckedOut(): Promise<boolean> {
      const r = await runGit(['-C', data.repo_path, 'branch', '--show-current']);
      return r.code === 0 && r.stdout.trim() === data.branch_name;
    },

    async commit(msg: string): Promise<void> {
      ensureOk('git', ['add', '.'], await runGit(['-C', data.worktree_path, 'add', '.']));
      const status = await runGit(['-C', data.worktree_path, 'status', '--porcelain']);
      if (status.stdout.trim().length === 0) return; // nothing to commit
      ensureOk(
        'git',
        ['commit', '-m', msg, '--no-verify'],
        await runGit(['-C', data.worktree_path, 'commit', '-m', msg, '--no-verify']),
      );
    },

    async pushAndOpen(msg: string, open: boolean): Promise<void> {
      await ensureGhAuthed();
      await self.commit(msg);
      // best-effort sync then push
      const branch = data.branch_name;
      const sync1 = await runCmd('gh', ['repo', 'sync', '--source', '-b', branch], {
        cwd: data.worktree_path,
      });
      if (sync1.code !== 0) {
        ensureOk(
          'git',
          ['push', '-u', 'origin', branch],
          await runGit(['-C', data.worktree_path, 'push', '-u', 'origin', branch]),
        );
      }
      await runCmd('gh', ['repo', 'sync', '-b', branch], { cwd: data.worktree_path });
      if (open) {
        await runCmd('gh', ['browse', '--branch', branch], { cwd: data.worktree_path });
      }
    },
  };
  return self;
}

async function safeRemoveWorktree(path: string): Promise<void> {
  // `git worktree remove -f` needs to be run from inside the repo; the path itself works.
  // We don't know the repo here for arbitrary calls; rely on `git -C <path>` failing silently.
  await runGit(['worktree', 'remove', '-f', path]);
}
