import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createStorage } from '../session/storage.js';
import { loadConfig } from '../shared/config.js';
import { DEFAULT_DAEMON_POLL_MS } from '../shared/constants.js';
import { createThrottledLogger, log } from '../shared/logger.js';
import { daemonPidPath } from '../shared/paths.js';

export async function launchDaemon(): Promise<void> {
  const self = process.argv[0]!; // bun / node
  const entry = process.argv[1]!; // our cli script
  const child = spawn(self, [entry, 'daemon'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  await writeFile(daemonPidPath(), String(child.pid ?? ''), 'utf8');
}

export async function stopDaemon(): Promise<void> {
  const pidPath = daemonPidPath();
  if (!existsSync(pidPath)) return;
  try {
    const pidStr = (await readFile(pidPath, 'utf8')).trim();
    const pid = Number.parseInt(pidStr, 10);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // process already gone
    }
  } finally {
    await unlink(pidPath).catch(() => undefined);
  }
}

export async function runDaemon(): Promise<void> {
  const cfg = await loadConfig();
  const storage = createStorage();
  const throttle = createThrottledLogger(60_000);
  const interval = cfg.daemon_poll_interval || DEFAULT_DAEMON_POLL_MS;

  const instances = await storage.loadInstances(cfg.branch_prefix);
  for (const inst of instances) {
    inst.autoYes = true;
    if (!inst.isPaused()) {
      try {
        await inst.start(false);
      } catch (err) {
        log.warn(`daemon: failed to attach to ${inst.title}`, err);
      }
    }
  }

  let stopped = false;
  process.on('SIGINT', () => {
    stopped = true;
  });
  process.on('SIGTERM', () => {
    stopped = true;
  });

  while (!stopped) {
    for (const inst of instances) {
      if (!inst.hasStarted() || inst.isPaused()) continue;
      try {
        const { hasPrompt } = await inst.hasUpdated();
        if (hasPrompt) {
          await inst.tapEnter();
          await inst.computeDiffNumstat();
        }
      } catch (err) {
        if (throttle.shouldLog()) log.warn(`daemon: tick error on ${inst.title}`, err);
      }
    }
    await sleep(interval);
  }

  await storage.saveInstances(instances);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
