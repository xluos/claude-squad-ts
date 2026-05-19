import { runCmd } from '../../session/git/exec.js';
import { createStorage } from '../../session/storage.js';
import { loadConfig } from '../../shared/config.js';

export async function runReset(): Promise<void> {
  const cfg = await loadConfig();
  const storage = createStorage();
  const instances = await storage.loadInstances(cfg.branch_prefix);
  for (const inst of instances) {
    try {
      await inst.kill();
      process.stdout.write(`✓ killed ${inst.title}\n`);
    } catch (err) {
      process.stdout.write(`✗ ${inst.title}: ${(err as Error).message}\n`);
    }
  }
  await storage.deleteAll();
  // Best-effort: also kill any stray tmux sessions with our prefix.
  const ls = await runCmd('tmux', ['ls', '-F', '#{session_name}']);
  if (ls.code === 0) {
    for (const name of ls.stdout.split('\n').filter((n) => n.startsWith('claudesquad_'))) {
      await runCmd('tmux', ['kill-session', '-t', name]);
      process.stdout.write(`✓ killed tmux ${name}\n`);
    }
  }
  process.stdout.write('Done.\n');
}
