import type { CommitMessageProvider } from './commit-hook.js';
import { runGit } from './exec.js';

/**
 * Structured reason a precheck refused to proceed. Lifted out of plain
 * strings so the UI layer can localize it — keep this module free of
 * presentation concerns.
 */
export type MergeBlocker =
  | { kind: 'hostDetachedHead' }
  | { kind: 'hostDirty' }
  | { kind: 'sourceBranchMissing'; branch: string }
  | { kind: 'worktreeDetachedHead' }
  | { kind: 'worktreeDirty' }
  | { kind: 'worktreeOnHostBranch'; branch: string }
  | { kind: 'hostBranchMissing'; branch: string }
  | { kind: 'mergePrecheckFailed'; detail: string }
  | { kind: 'syncPrecheckFailed'; detail: string };

/**
 * Outcome of the merge precheck. Exactly one of these is true:
 *  - `clean === true` and `conflicts.length === 0` → safe to merge
 *  - `conflicts.length > 0`                        → conflicts on those paths
 *  - `blocker` set                                 → won't even attempt (dirty host etc.)
 */
export interface MergePrecheck {
  clean: boolean;
  /** Current host repo branch. Empty for detached HEAD. */
  hostBranch: string;
  /** Files that would conflict if we merged. */
  conflicts: string[];
  /** Set when the precheck refused to attempt (dirty host, detached HEAD,
   * missing branch, ...). Mutually exclusive with `conflicts`. */
  blocker?: MergeBlocker;
}

/**
 * Ask git whether merging `sourceBranch` into the host repo's current branch
 * would succeed cleanly. Uses `git merge-tree` (modern form, git ≥ 2.38) so
 * the host worktree and index are never touched.
 */
export async function precheckMerge(
  hostPath: string,
  sourceBranch: string,
): Promise<MergePrecheck> {
  const branchR = await runGit(['-C', hostPath, 'branch', '--show-current']);
  const hostBranch = branchR.stdout.trim();
  if (!hostBranch) {
    return {
      clean: false,
      hostBranch: '',
      conflicts: [],
      blocker: { kind: 'hostDetachedHead' },
    };
  }

  const statusR = await runGit(['-C', hostPath, 'status', '--porcelain']);
  if (statusR.code === 0 && statusR.stdout.trim().length > 0) {
    return {
      clean: false,
      hostBranch,
      conflicts: [],
      blocker: { kind: 'hostDirty' },
    };
  }

  const refR = await runGit(['-C', hostPath, 'rev-parse', '--verify', sourceBranch]);
  if (refR.code !== 0) {
    return {
      clean: false,
      hostBranch,
      conflicts: [],
      blocker: { kind: 'sourceBranchMissing', branch: sourceBranch },
    };
  }

  // `git merge-tree --name-only HEAD <branch>` writes a merged tree to the
  // object DB and exits 0 on success / 1 on conflict. With `--name-only`,
  // conflicting paths are emitted on stdout; on success only the resulting
  // tree OID is printed (one 40-char hex line we filter out below).
  const mtR = await runGit([
    '-C',
    hostPath,
    'merge-tree',
    '--name-only',
    '--no-messages',
    'HEAD',
    sourceBranch,
  ]);

  const conflicts = mtR.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[0-9a-f]{40,}$/.test(l));

  if (mtR.code === 0 && conflicts.length === 0) {
    return { clean: true, hostBranch, conflicts: [] };
  }
  if (conflicts.length === 0) {
    // Non-zero exit but no parsed conflict list — probably an old git that
    // doesn't understand the modern invocation. Surface the stderr so the
    // user knows precheck didn't actually run.
    return {
      clean: false,
      hostBranch,
      conflicts: [],
      blocker: { kind: 'mergePrecheckFailed', detail: (mtR.stderr || mtR.stdout).trim() },
    };
  }
  return { clean: false, hostBranch, conflicts };
}

/**
 * Run the actual merge in the host repo. Always creates a merge commit
 * (`--no-ff`) so the integration point is preserved in history.
 *
 * With no `getMessage`, this is the original one-shot `git merge -m <built-in>`
 * — zero behavioural change. With a hook, it splits into `merge --no-commit`
 * (folds the result into the index so the hook can read the staged diff) →
 * hook → `git commit`. Any failure runs `merge --abort` so the host repo is
 * never left mid-merge.
 */
export async function mergeIntoHost(
  hostPath: string,
  sourceBranch: string,
  getMessage?: CommitMessageProvider,
): Promise<void> {
  const fallback = `[claudesquad] merge ${sourceBranch}`;
  if (!getMessage) {
    const r = await runGit(['-C', hostPath, 'merge', '--no-ff', '-m', fallback, sourceBranch]);
    if (r.code !== 0) {
      throw new Error((r.stderr || r.stdout).trim() || `git merge ${sourceBranch} failed`);
    }
    return;
  }

  const mg = await runGit(['-C', hostPath, 'merge', '--no-ff', '--no-commit', sourceBranch]);
  if (mg.code !== 0) {
    await runGit(['-C', hostPath, 'merge', '--abort']);
    throw new Error((mg.stderr || mg.stdout).trim() || `git merge ${sourceBranch} failed`);
  }
  // No MERGE_HEAD → "Already up to date": nothing to commit, mirror the
  // one-shot path which also produces no commit in that case.
  const mh = await runGit(['-C', hostPath, 'rev-parse', '--verify', '-q', 'MERGE_HEAD']);
  if (mh.code !== 0) return;

  let message: string;
  try {
    message = await getMessage(hostPath, fallback);
  } catch (err) {
    await runGit(['-C', hostPath, 'merge', '--abort']);
    throw err;
  }
  const cm = await runGit(['-C', hostPath, 'commit', '-m', message]);
  if (cm.code !== 0) {
    await runGit(['-C', hostPath, 'merge', '--abort']);
    throw new Error(
      (cm.stderr || cm.stdout).trim() || `git commit on merge of ${sourceBranch} failed`,
    );
  }
}

/**
 * Pull the just-created merge commit back into the worktree branch by
 * fast-forwarding. Without this the worktree shows `↓1` immediately
 * after merge — the merge commit lives only on host until something
 * advances the source branch up to it.
 *
 * Safe because `mergeIntoHost` made the worktree's HEAD the second
 * parent of the merge commit, so the worktree branch is by construction
 * an ancestor of `hostBranch`. `--ff-only` therefore can never invent
 * new content; it just bumps the ref (and may advance files if the
 * merge folded in host-side changes the agent hadn't seen, which is
 * the desired side effect).
 */
export async function fastForwardWorktreeToHost(
  worktreePath: string,
  hostBranch: string,
): Promise<void> {
  const r = await runGit(['-C', worktreePath, 'merge', '--ff-only', hostBranch]);
  if (r.code !== 0) {
    throw new Error((r.stderr || r.stdout).trim() || `git merge --ff-only ${hostBranch} failed`);
  }
}

/**
 * Squash-merge `sourceBranch` into the host repo's current branch and commit
 * with a single message — the apply (`a`) flow. Conflict-safety: if the
 * squash leaves unmerged paths, we run `git reset --hard HEAD` to wipe the
 * half-applied state (the precheck already refused on a dirty host, so this
 * only erases the squash's own staging). Caller is expected to have run
 * `precheckMerge` first — squash and regular merge share the same conflict
 * surface, so no separate dry-run helper.
 */
export async function squashMergeIntoHost(
  hostPath: string,
  sourceBranch: string,
  message: string,
  getMessage?: CommitMessageProvider,
): Promise<void> {
  const sq = await runGit(['-C', hostPath, 'merge', '--squash', sourceBranch]);
  if (sq.code !== 0) {
    await runGit(['-C', hostPath, 'reset', '--hard', 'HEAD']);
    throw new Error((sq.stderr || sq.stdout).trim() || `git merge --squash ${sourceBranch} failed`);
  }
  // `merge --squash` may yield an empty staging area when the source has no
  // commits beyond host — treat as no-op success instead of erroring on
  // "nothing to commit".
  const diff = await runGit(['-C', hostPath, 'diff', '--cached', '--quiet']);
  if (diff.code === 0) return;
  // The squash already staged everything, so the hook can read the diff now.
  // On hook failure, `reset --hard HEAD` wipes the staged squash before we
  // rethrow, leaving the host clean.
  let finalMessage = message;
  if (getMessage) {
    try {
      finalMessage = await getMessage(hostPath, message);
    } catch (err) {
      await runGit(['-C', hostPath, 'reset', '--hard', 'HEAD']);
      throw err;
    }
  }
  const cm = await runGit(['-C', hostPath, 'commit', '-m', finalMessage]);
  if (cm.code !== 0) {
    await runGit(['-C', hostPath, 'reset', '--hard', 'HEAD']);
    throw new Error((cm.stderr || cm.stdout).trim() || 'failed to commit squash result');
  }
}

/**
 * Mirror of `precheckMerge` for the reverse direction: ask whether merging
 * the host's current branch *down into the worktree* would succeed cleanly.
 * Uses `git merge-tree` so neither the worktree files nor its index are
 * touched. The caller decides what to do with conflicts — for the sync flow
 * we just toast and bail instead of opening a resolution overlay.
 */
export async function precheckSyncFromHost(
  worktreePath: string,
  hostBranch: string,
): Promise<MergePrecheck> {
  const branchR = await runGit(['-C', worktreePath, 'branch', '--show-current']);
  const worktreeBranch = branchR.stdout.trim();
  if (!worktreeBranch) {
    return {
      clean: false,
      hostBranch: worktreeBranch,
      conflicts: [],
      blocker: { kind: 'worktreeDetachedHead' },
    };
  }

  // Dirty worktree → refuse. Unlike the worktree→host direction we can't
  // auto-commit here, because the agent may be mid-edit; merging on top
  // of half-written files is worse than telling the user to wait.
  const statusR = await runGit(['-C', worktreePath, 'status', '--porcelain']);
  if (statusR.code === 0 && statusR.stdout.trim().length > 0) {
    return {
      clean: false,
      hostBranch: worktreeBranch,
      conflicts: [],
      blocker: { kind: 'worktreeDirty' },
    };
  }

  if (worktreeBranch === hostBranch) {
    return {
      clean: false,
      hostBranch: worktreeBranch,
      conflicts: [],
      blocker: { kind: 'worktreeOnHostBranch', branch: hostBranch },
    };
  }

  const refR = await runGit(['-C', worktreePath, 'rev-parse', '--verify', hostBranch]);
  if (refR.code !== 0) {
    return {
      clean: false,
      hostBranch: worktreeBranch,
      conflicts: [],
      blocker: { kind: 'hostBranchMissing', branch: hostBranch },
    };
  }

  const mtR = await runGit([
    '-C',
    worktreePath,
    'merge-tree',
    '--name-only',
    '--no-messages',
    'HEAD',
    hostBranch,
  ]);

  const conflicts = mtR.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[0-9a-f]{40,}$/.test(l));

  if (mtR.code === 0 && conflicts.length === 0) {
    return { clean: true, hostBranch: worktreeBranch, conflicts: [] };
  }
  if (conflicts.length === 0) {
    return {
      clean: false,
      hostBranch: worktreeBranch,
      conflicts: [],
      blocker: { kind: 'syncPrecheckFailed', detail: (mtR.stderr || mtR.stdout).trim() },
    };
  }
  return { clean: false, hostBranch: worktreeBranch, conflicts };
}

/**
 * Actually fold `hostBranch` into the worktree's current branch. FF when
 * possible (less noise than the host-direction merge); on any failure
 * we run `merge --abort` so the worktree doesn't get stuck in MERGING —
 * the TUI offers no resolution UI, so a half-merged worktree is worse
 * than no merge at all.
 */
export async function syncFromHost(
  worktreePath: string,
  hostBranch: string,
  getMessage?: CommitMessageProvider,
): Promise<void> {
  const fallback = `[claudesquad] sync ${hostBranch}`;
  if (!getMessage) {
    const r = await runGit(['-C', worktreePath, 'merge', '-m', fallback, hostBranch]);
    if (r.code !== 0) {
      await runGit(['-C', worktreePath, 'merge', '--abort']);
      throw new Error((r.stderr || r.stdout).trim() || `git merge ${hostBranch} failed`);
    }
    return;
  }

  const mg = await runGit(['-C', worktreePath, 'merge', '--no-commit', hostBranch]);
  if (mg.code !== 0) {
    await runGit(['-C', worktreePath, 'merge', '--abort']);
    throw new Error((mg.stderr || mg.stdout).trim() || `git merge ${hostBranch} failed`);
  }
  // Fast-forward or already-up-to-date → no MERGE_HEAD, no commit to make
  // (matches the default-merge path, which FFs without a message too).
  const mh = await runGit(['-C', worktreePath, 'rev-parse', '--verify', '-q', 'MERGE_HEAD']);
  if (mh.code !== 0) return;

  let message: string;
  try {
    message = await getMessage(worktreePath, fallback);
  } catch (err) {
    await runGit(['-C', worktreePath, 'merge', '--abort']);
    throw err;
  }
  const cm = await runGit(['-C', worktreePath, 'commit', '-m', message]);
  if (cm.code !== 0) {
    await runGit(['-C', worktreePath, 'merge', '--abort']);
    throw new Error(
      (cm.stderr || cm.stdout).trim() || `git commit on sync of ${hostBranch} failed`,
    );
  }
}
