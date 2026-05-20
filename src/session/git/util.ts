import { MAX_BRANCH_RESULTS } from '../../shared/constants.js';
import { ensureOk, runCmd, runGit } from './exec.js';

export async function isGitRepo(path: string): Promise<boolean> {
  const res = await runGit(['-C', path, 'rev-parse', '--show-toplevel']);
  return res.code === 0;
}

export async function findRepoRoot(path: string): Promise<string> {
  const r = await runGit(['-C', path, 'rev-parse', '--show-toplevel']);
  if (r.code !== 0) throw new Error(`not a git repo: ${path}`);
  return r.stdout.trim();
}

export async function getHeadSha(repoPath: string): Promise<string> {
  const r = ensureOk(
    'git',
    ['-C', repoPath, 'rev-parse', 'HEAD'],
    await runGit(['-C', repoPath, 'rev-parse', 'HEAD']),
  );
  return r.stdout.trim();
}

export async function hasInitialCommit(repoPath: string): Promise<boolean> {
  const r = await runGit(['-C', repoPath, 'rev-parse', 'HEAD']);
  return r.code === 0;
}

/**
 * The host repo's currently checked-out branch — i.e. the prospective
 * merge target that `commitCounts()` uses as the `↑↓` reference. Returns
 * null when HEAD is detached, when the repo has no commits yet, or on
 * any git error, since the only consumer (the Diff tab label) just
 * hides itself in those cases.
 */
export async function getHostBranch(repoPath: string): Promise<string | null> {
  const r = await runGit(['-C', repoPath, 'symbolic-ref', '--short', '-q', 'HEAD']);
  if (r.code !== 0) return null;
  const name = r.stdout.trim();
  return name.length > 0 ? name : null;
}

/** Validate that gh CLI is installed and authenticated. */
export async function ensureGhAuthed(): Promise<void> {
  const which = await runCmd('which', ['gh']);
  if (which.code !== 0) {
    throw new Error('GitHub CLI (gh) is not installed. See https://cli.github.com/');
  }
  const status = await runCmd('gh', ['auth', 'status']);
  if (status.code !== 0) {
    throw new Error('GitHub CLI not authenticated. Run `gh auth login` first.');
  }
}

export function sanitizeBranchName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_/.]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

export async function searchBranches(repoPath: string, filter: string): Promise<string[]> {
  const r = await runGit([
    '-C',
    repoPath,
    'branch',
    '-a',
    '--sort=-committerdate',
    '--format=%(refname:short)',
  ]);
  if (r.code !== 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const needle = filter.toLowerCase();
  for (const raw of r.stdout.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('origin/')) line = line.slice('origin/'.length);
    if (line === 'HEAD' || line.endsWith('/HEAD')) continue;
    if (seen.has(line)) continue;
    if (needle && !line.toLowerCase().includes(needle)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= MAX_BRANCH_RESULTS) break;
  }
  return out;
}

export async function fetchPrune(repoPath: string): Promise<void> {
  await runGit(['-C', repoPath, 'fetch', '--prune']);
}

export async function localBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const r = await runGit(['-C', repoPath, 'show-ref', '--verify', `refs/heads/${branch}`]);
  return r.code === 0;
}

export async function remoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const r = await runGit(['-C', repoPath, 'show-ref', '--verify', `refs/remotes/origin/${branch}`]);
  return r.code === 0;
}
