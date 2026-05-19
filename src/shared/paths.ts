import { mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const APP_DIR_NAME = '.claude-squad';

export function appDir(): string {
  return join(homedir(), APP_DIR_NAME);
}

export function configPath(): string {
  return join(appDir(), 'config.json');
}

export function statePath(): string {
  return join(appDir(), 'state.json');
}

export function daemonPidPath(): string {
  return join(appDir(), 'daemon.pid');
}

export function worktreesRoot(): string {
  return join(appDir(), 'worktrees');
}

export function logFilePath(): string {
  return join(tmpdir(), 'claudesquad.log');
}

export async function ensureAppDir(): Promise<void> {
  await mkdir(appDir(), { recursive: true });
  await mkdir(worktreesRoot(), { recursive: true });
}
