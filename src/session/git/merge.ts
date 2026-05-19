import { runGit } from './exec.js';

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
  blocker?: string;
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
      blocker: 'host repo is in detached HEAD — checkout a branch first',
    };
  }

  const statusR = await runGit(['-C', hostPath, 'status', '--porcelain']);
  if (statusR.code === 0 && statusR.stdout.trim().length > 0) {
    return {
      clean: false,
      hostBranch,
      conflicts: [],
      blocker: 'host repo has uncommitted changes — commit or stash first',
    };
  }

  const refR = await runGit(['-C', hostPath, 'rev-parse', '--verify', sourceBranch]);
  if (refR.code !== 0) {
    return {
      clean: false,
      hostBranch,
      conflicts: [],
      blocker: `branch "${sourceBranch}" not found in host repo (was the worktree pushed?)`,
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
      blocker: (mtR.stderr || mtR.stdout).trim() || 'merge precheck failed',
    };
  }
  return { clean: false, hostBranch, conflicts };
}

/**
 * Run the actual merge in the host repo. Always creates a merge commit
 * (`--no-ff`) so the integration point is preserved in history.
 */
export async function mergeIntoHost(hostPath: string, sourceBranch: string): Promise<void> {
  const r = await runGit([
    '-C',
    hostPath,
    'merge',
    '--no-ff',
    '-m',
    `[claudesquad] merge ${sourceBranch}`,
    sourceBranch,
  ]);
  if (r.code !== 0) {
    throw new Error((r.stderr || r.stdout).trim() || `git merge ${sourceBranch} failed`);
  }
}
