import type { DiffStats } from '../../shared/types.js';
import { runGit } from './exec.js';

export async function computeDiff(worktreePath: string, baseSha: string): Promise<DiffStats> {
  // Stage untracked so diff shows them; ignore lock errors from concurrent git ops
  await runGit(['-C', worktreePath, 'add', '-N', '.']).catch(() => {});
  const r = await runGit(['-C', worktreePath, '--no-pager', 'diff', baseSha]);
  if (r.code !== 0) {
    return { added: 0, removed: 0, content: '', error: r.stderr.trim() };
  }
  let added = 0;
  let removed = 0;
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added++;
    else if (line.startsWith('-')) removed++;
  }
  return { added, removed, content: r.stdout };
}

export async function computeDiffNumstat(
  worktreePath: string,
  baseSha: string,
): Promise<DiffStats> {
  await runGit(['-C', worktreePath, 'add', '-N', '.']).catch(() => {});
  const r = await runGit(['-C', worktreePath, '--no-pager', 'diff', '--numstat', baseSha]);
  if (r.code !== 0) {
    return { added: 0, removed: 0, error: r.stderr.trim() };
  }
  let added = 0;
  let removed = 0;
  for (const line of r.stdout.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const [a, b] = parts;
    if (a === '-' || b === '-') continue;
    const ai = Number.parseInt(a ?? '0', 10);
    const bi = Number.parseInt(b ?? '0', 10);
    if (!Number.isNaN(ai)) added += ai;
    if (!Number.isNaN(bi)) removed += bi;
  }
  return { added, removed };
}
