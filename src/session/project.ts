import { createHash } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { basename } from 'node:path';
import { log } from '../shared/logger.js';
import { statePath } from '../shared/paths.js';
import {
  loadGlobalState,
  loadLegacyState,
  loadProjectState,
  saveGlobalState,
  saveProjectState,
  upsertProject,
} from '../shared/state.js';
import type { GlobalState, ProjectMeta } from '../shared/types.js';

const CURRENT_MIGRATION_VERSION = 1;

/** Stable per-repository identifier. sha256(repoPath) truncated to 16 hex
 *  chars — matches the Go upstream so a future re-port stays compatible. */
export function generateProjectID(repoPath: string): string {
  return createHash('sha256').update(repoPath).digest('hex').slice(0, 16);
}

/** Make sure the project is registered in `global_state.json`. Returns
 *  the canonical metadata. Idempotent — running twice with the same
 *  repoPath is fine. */
export async function ensureProject(repoPath: string, name?: string): Promise<ProjectMeta> {
  const id = generateProjectID(repoPath);
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id,
    name: name ?? basename(repoPath),
    repo_path: repoPath,
    created_at: now,
    updated_at: now,
    instance_count: 0,
  };
  const state = await upsertProject(meta);
  return state.projects.find((p) => p.id === id) ?? meta;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const state = await loadGlobalState();
  return state.projects;
}

/**
 * One-shot migration from the pre-multi-project single `state.json` to
 * per-project state files. Idempotent: keyed off
 * `global_state.last_migration_version`. Legacy instances are grouped by
 * their recorded `worktree.repo_path` (falling back to `path`) and
 * written into the matching project's state file. The legacy file is
 * renamed to `state.json.legacy.bak` on success — we keep the bytes
 * around in case a user wants to roll back.
 */
export async function migrateLegacyIfNeeded(): Promise<void> {
  const global: GlobalState = await loadGlobalState();
  if (global.last_migration_version >= CURRENT_MIGRATION_VERSION) return;

  const legacy = await loadLegacyState();
  if (!legacy || legacy.instances.length === 0) {
    // Nothing to move, but still bump the version + carry over the
    // help-mask so we don't try again next launch.
    if (legacy) global.help_screens_seen |= legacy.help_screens_seen;
    global.last_migration_version = CURRENT_MIGRATION_VERSION;
    await saveGlobalState(global);
    return;
  }

  log.info(`[migration] moving ${legacy.instances.length} legacy instance(s) into projects/`);

  // Group by recorded repo path. Empty / missing → fall back to the
  // instance's own path. Anything left empty is dropped with a warning.
  const groups = new Map<string, typeof legacy.instances>();
  for (const inst of legacy.instances) {
    const repoPath = inst.worktree?.repo_path || inst.path;
    if (!repoPath) {
      log.warn(`[migration] dropping instance ${inst.title} — no repo_path recorded`);
      continue;
    }
    const bucket = groups.get(repoPath) ?? [];
    bucket.push(inst);
    groups.set(repoPath, bucket);
  }

  for (const [repoPath, instances] of groups) {
    try {
      const meta = await ensureProject(repoPath);
      const projectState = await loadProjectState(meta.id, repoPath);
      // Don't overwrite a project that already has instances — that'd
      // clobber data written by a newer run.
      if (projectState.instances.length > 0) {
        log.info(
          `[migration] project ${meta.id} already has ${projectState.instances.length} instance(s) — skipping`,
        );
        continue;
      }
      projectState.instances = instances;
      await saveProjectState(projectState);
      log.info(`[migration] moved ${instances.length} instance(s) into project ${meta.id}`);
    } catch (err) {
      log.warn(`[migration] failed to migrate project ${repoPath}`, err);
    }
  }

  // Carry the help mask forward and mark complete.
  global.help_screens_seen |= legacy.help_screens_seen;
  global.last_migration_version = CURRENT_MIGRATION_VERSION;
  await saveGlobalState(global);

  // Rename legacy file so steady-state code never sees it again. If
  // rename fails (e.g. permission), log but don't abort — the
  // migration-version guard above already keeps us idempotent.
  try {
    await rename(statePath(), `${statePath()}.legacy.bak`);
  } catch (err) {
    log.warn('[migration] failed to rename legacy state.json', err);
  }
}
