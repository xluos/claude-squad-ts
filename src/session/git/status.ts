import type { GitStatus } from '../../shared/types.js';
import { runGit } from './exec.js';

const EMPTY: GitStatus = {
  modified: 0,
  untracked: 0,
  staged: 0,
  deleted: 0,
  renamed: 0,
  conflicted: 0,
};

/**
 * Run `git status --porcelain=v2 -z -uall` against the worktree and
 * tally the buckets used by the instance-list bracket.
 *
 * We use porcelain=v2 (not v1) because the diff path runs `git add -N .`
 * to surface untracked files in the diff output. That mutation registers
 * intent-to-add entries, which both formats render visibly — but v2's
 * `.A` XY shape (vs a real `git add`'s `A.`) makes them trivially
 * distinguishable. countOrdinary() reclassifies `.A` entries back to
 * untracked, so `?N` stays honest even after the diff tick has
 * polluted the index.
 *
 * `-z` makes each entry NUL-terminated, which is the only safe way to
 * walk this output when filenames may contain newlines or spaces.
 * Rename/copy entries (category `2`) consume two NUL chunks (entry +
 * original path), so the loop advances `i` accordingly.
 */
export async function computeGitStatus(worktreePath: string): Promise<GitStatus> {
  const r = await runGit([
    '-C',
    worktreePath,
    '--no-pager',
    'status',
    '--porcelain=v2',
    '-z',
    '-uall',
  ]);
  if (r.code !== 0) return { ...EMPTY };

  const out: GitStatus = { ...EMPTY };
  const entries = r.stdout.split('\x00');
  // The split leaves a trailing empty string after the final NUL — that's fine,
  // it falls through the loop without matching any prefix.
  let i = 0;
  while (i < entries.length) {
    const e = entries[i]!;
    if (!e) {
      i++;
      continue;
    }
    if (e.startsWith('1 ')) {
      countOrdinary(e, out);
      i++;
    } else if (e.startsWith('2 ')) {
      // rename/copy in the index — the next NUL chunk is the original path
      out.renamed++;
      i += 2;
    } else if (e.startsWith('u ')) {
      out.conflicted++;
      i++;
    } else if (e.startsWith('? ')) {
      out.untracked++;
      i++;
    } else {
      // `# branch.…` headers, `! ignored`, anything else → skip
      i++;
    }
  }
  return out;
}

/** Parse one `1 XY sub mH mI mW hH hI path` line. */
function countOrdinary(line: string, out: GitStatus): void {
  const tokens = line.split(' ');
  // tokens[0] = '1'
  const xy = tokens[1] ?? '..';
  const x = xy[0] ?? '.';
  const y = xy[1] ?? '.';

  // Intent-to-add (from `git add -N`) shows up as `.A` in v2 — the index
  // side is unmodified relative to HEAD, only the worktree side reports
  // "added". A real `git add` instead gives `A.` (or `AM` if subsequently
  // modified). Treat intent-to-add as untracked so the bracket count
  // stays honest across the diff path's add-N tick.
  if (x === '.' && y === 'A') {
    out.untracked++;
    return;
  }

  // Index (staged) side
  if (x !== '.') {
    if (x === 'R' || x === 'C') out.renamed++;
    else if (x === 'D') out.deleted++;
    else out.staged++; // A / M / T
  }
  // Worktree (unstaged) side
  if (y !== '.') {
    if (y === 'D') out.deleted++;
    else if (y === 'R' || y === 'C') out.renamed++;
    else out.modified++; // M / T
  }
}
