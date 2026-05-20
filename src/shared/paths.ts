import { mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const APP_DIR_NAME = '.claude-squad';
export const PROJECTS_DIR_NAME = 'projects';
export const PROJECT_STATE_FILE_NAME = 'state.json';
export const PROJECT_WORKTREES_DIR_NAME = 'worktrees';
export const GLOBAL_STATE_FILE_NAME = 'global_state.json';

export function appDir(): string {
  return join(homedir(), APP_DIR_NAME);
}

export function configPath(): string {
  return join(appDir(), 'config.json');
}

/** Legacy global state file. Pre-multi-project versions stored every
 *  instance here. After migration we only read it for `migrateLegacyIfNeeded`. */
export function statePath(): string {
  return join(appDir(), 'state.json');
}

/** New global state file. Holds the project registry, help-screens mask,
 *  and migration version. */
export function globalStatePath(): string {
  return join(appDir(), GLOBAL_STATE_FILE_NAME);
}

export function daemonPidPath(): string {
  return join(appDir(), 'daemon.pid');
}

/** Legacy global worktree pool. Pre-multi-project worktrees still live
 *  here; their persisted absolute paths keep working — we don't move them
 *  on migration. New worktrees use `projectWorktreesRoot(projectID)`. */
export function worktreesRoot(): string {
  return join(appDir(), 'worktrees');
}

export function projectsRoot(): string {
  return join(appDir(), PROJECTS_DIR_NAME);
}

export function projectDir(projectID: string): string {
  return join(projectsRoot(), projectID);
}

export function projectStatePath(projectID: string): string {
  return join(projectDir(projectID), PROJECT_STATE_FILE_NAME);
}

export function projectWorktreesRoot(projectID: string): string {
  return join(projectDir(projectID), PROJECT_WORKTREES_DIR_NAME);
}

export function logFilePath(): string {
  return join(tmpdir(), 'claudesquad.log');
}

export async function ensureAppDir(): Promise<void> {
  await mkdir(appDir(), { recursive: true });
  await mkdir(projectsRoot(), { recursive: true });
}

export async function ensureProjectDir(projectID: string): Promise<void> {
  await mkdir(projectDir(projectID), { recursive: true });
  await mkdir(projectWorktreesRoot(projectID), { recursive: true });
}
