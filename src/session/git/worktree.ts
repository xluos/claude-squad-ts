import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { projectWorktreesRoot } from '../../shared/paths.js';
import type { DiffStats, GitStatus, WorktreeData } from '../../shared/types.js';
import type { CommitMessageProvider } from './commit-hook.js';
import { computeDiff, computeDiffNumstat } from './diff.js';
import { ensureOk, runCmd, runGit } from './exec.js';
import { computeGitStatus } from './status.js';
import {
  ensureGhAuthed,
  findRepoRoot,
  getHeadSha,
  getHostBranch,
  localBranchExists,
  remoteBranchExists,
  sanitizeBranchName,
} from './util.js';

export interface WorktreeInit {
  repoPath: string;
  sessionName: string;
  branchPrefix: string;
  /** Project the worktree belongs to. Scopes the on-disk worktree path
   *  to `~/.claude-squad/projects/<projectID>/worktrees/`. */
  projectID: string;
}

/** Commit divergence between the worktree branch and the host repo's
 *  currently checked-out branch (the prospective merge target). */
export interface CommitCounts {
  /** Commits on the worktree branch not yet on host HEAD — i.e. work
   *  that still needs to be merged. Drops to 0 once a merge lands. */
  ahead: number;
  /** Commits on host HEAD not on the worktree branch — host moved
   *  forward (other merges, direct commits, ...) without us. */
  behind: number;
}

export interface Worktree {
  data: WorktreeData;
  setup(): Promise<void>;
  cleanup(): Promise<void>;
  remove(): Promise<void>;
  prune(): Promise<void>;
  diff(): Promise<DiffStats>;
  diffNumstat(): Promise<DiffStats>;
  status(): Promise<GitStatus>;
  commitCounts(): Promise<CommitCounts>;
  isDirty(): Promise<boolean>;
  isValid(): Promise<boolean>;
  isBranchCheckedOut(): Promise<boolean>;
  commit(msg: string, getMessage?: CommitMessageProvider): Promise<void>;
  pushAndOpen(msg: string, open: boolean): Promise<void>;
}

export async function createWorktree(init: WorktreeInit): Promise<Worktree> {
  const repoPath = await findRepoRoot(init.repoPath);
  const branchName = `${init.branchPrefix}${sanitizeBranchName(init.sessionName)}`;
  // Snapshot the host's branch at creation time so the Diff "based on …"
  // chip and reverse-sync source stay pinned to the fork point — even if
  // host later checks out a different branch.
  const baseBranch = (await getHostBranch(repoPath)) ?? '';
  return buildWorktree({
    repo_path: repoPath,
    worktree_path: makeWorktreePath(init.projectID, init.sessionName),
    session_name: init.sessionName,
    branch_name: branchName,
    base_commit_sha: '',
    is_existing_branch: false,
    base_branch_name: baseBranch,
  });
}

export async function createWorktreeFromBranch(
  repoPath: string,
  branchName: string,
  sessionName: string,
  projectID: string,
): Promise<Worktree> {
  const repo = await findRepoRoot(repoPath);
  return buildWorktree({
    repo_path: repo,
    worktree_path: makeWorktreePath(projectID, sessionName),
    session_name: sessionName,
    branch_name: branchName,
    base_commit_sha: '',
    is_existing_branch: true,
    base_branch_name: branchName,
  });
}

export function worktreeFromData(data: WorktreeData): Worktree {
  return buildWorktree({ ...data });
}

function makeWorktreePath(projectID: string, sessionName: string): string {
  const safe = sanitizeBranchName(sessionName) || 'session';
  return join(projectWorktreesRoot(projectID), `${safe}_${Date.now()}`);
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

    status(): Promise<GitStatus> {
      return computeGitStatus(data.worktree_path);
    },

    async commitCounts(): Promise<CommitCounts> {
      // Compare the worktree branch against the host repo's current HEAD
      // directly (not against the recorded fork point) — that way `ahead`
      // actually drops once a merge folds the branch into host, and
      // `behind` reflects whatever the host moved on to.
      //
      //   ahead  = HEAD..branch_name  (commits on branch, not yet on host)
      //   behind = branch_name..HEAD  (commits on host, not on branch)
      //
      // `git -C repo_path` runs in the outer clone, where HEAD = the
      // prospective merge target. If branch_name was deleted (e.g. the
      // instance was retired), rev-list fails → both return 0, which is
      // the sensible "nothing to show" answer.
      const [aheadR, behindR] = await Promise.all([
        runGit(['-C', data.repo_path, 'rev-list', '--count', `HEAD..${data.branch_name}`]),
        runGit(['-C', data.repo_path, 'rev-list', '--count', `${data.branch_name}..HEAD`]),
      ]);
      const ahead = aheadR.code === 0 ? Number(aheadR.stdout.trim()) || 0 : 0;
      const behind = behindR.code === 0 ? Number(behindR.stdout.trim()) || 0 : 0;
      return { ahead, behind };
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

    async commit(msg: string, getMessage?: CommitMessageProvider): Promise<void> {
      ensureOk('git', ['add', '.'], await runGit(['-C', data.worktree_path, 'add', '.']));
      const status = await runGit(['-C', data.worktree_path, 'status', '--porcelain']);
      if (status.stdout.trim().length === 0) return; // nothing to commit
      // Everything is staged now, so the hook can read the staged diff. A
      // throwing hook aborts the commit (the add is harmless to leave; the
      // worktree files are untouched and a later commit re-stages them).
      const finalMsg = getMessage ? await getMessage(data.worktree_path, msg) : msg;
      ensureOk(
        'git',
        ['commit', '-m', finalMsg, '--no-verify'],
        await runGit(['-C', data.worktree_path, 'commit', '-m', finalMsg, '--no-verify']),
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
