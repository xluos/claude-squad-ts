import { loadConfig } from '../../shared/config.js';
import {
  appDir,
  configPath,
  daemonPidPath,
  logFilePath,
  statePath,
  worktreesRoot,
} from '../../shared/paths.js';

export async function runDebug(): Promise<void> {
  const cfg = await loadConfig();
  const out = {
    paths: {
      appDir: appDir(),
      configPath: configPath(),
      statePath: statePath(),
      daemonPidPath: daemonPidPath(),
      worktreesRoot: worktreesRoot(),
      logFilePath: logFilePath(),
    },
    config: cfg,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}
