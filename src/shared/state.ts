import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  ensureAppDir,
  ensureProjectDir,
  globalStatePath,
  projectStatePath,
  statePath,
} from './paths.js';
import type {
  GlobalState,
  InstanceData,
  PersistedState,
  ProjectMeta,
  ProjectState,
} from './types.js';

// ===== Global state (project registry + help mask + migration version) =====

export function defaultGlobalState(): GlobalState {
  return { projects: [], help_screens_seen: 0, last_migration_version: 0 };
}

export async function loadGlobalState(): Promise<GlobalState> {
  await ensureAppDir();
  try {
    const raw = await readFile(globalStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<GlobalState>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      help_screens_seen: parsed.help_screens_seen ?? 0,
      last_migration_version: parsed.last_migration_version ?? 0,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultGlobalState();
    }
    throw err;
  }
}

export async function saveGlobalState(state: GlobalState): Promise<void> {
  await ensureAppDir();
  await writeFile(globalStatePath(), JSON.stringify(state, null, 2), 'utf8');
}

export async function markHelpSeen(bit: number): Promise<GlobalState> {
  const state = await loadGlobalState();
  state.help_screens_seen |= bit;
  await saveGlobalState(state);
  return state;
}

export function helpAlreadySeen(state: GlobalState, bit: number): boolean {
  return (state.help_screens_seen & bit) !== 0;
}

// ===== Per-project state (one file per project) =====

export function defaultProjectState(projectID: string, repoPath: string): ProjectState {
  const now = new Date().toISOString();
  return {
    project: {
      id: projectID,
      name: basename(repoPath),
      repo_path: repoPath,
      created_at: now,
      updated_at: now,
      instance_count: 0,
    },
    instances: [],
  };
}

export async function loadProjectState(projectID: string, repoPath: string): Promise<ProjectState> {
  await ensureProjectDir(projectID);
  try {
    const raw = await readFile(projectStatePath(projectID), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProjectState>;
    const defaults = defaultProjectState(projectID, repoPath);
    return {
      project: { ...defaults.project, ...(parsed.project ?? {}) },
      instances: Array.isArray(parsed.instances) ? (parsed.instances as InstanceData[]) : [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultProjectState(projectID, repoPath);
    }
    throw err;
  }
}

export async function saveProjectState(state: ProjectState): Promise<void> {
  await ensureProjectDir(state.project.id);
  state.project.updated_at = new Date().toISOString();
  state.project.instance_count = state.instances.length;
  await writeFile(projectStatePath(state.project.id), JSON.stringify(state, null, 2), 'utf8');
}

// ===== Project registry helpers =====

export async function upsertProject(meta: ProjectMeta): Promise<GlobalState> {
  const state = await loadGlobalState();
  const idx = state.projects.findIndex((p) => p.id === meta.id);
  if (idx >= 0) {
    state.projects[idx] = { ...state.projects[idx], ...meta, updated_at: new Date().toISOString() };
  } else {
    state.projects.push(meta);
  }
  await saveGlobalState(state);
  return state;
}

export async function updateProjectInstanceCount(projectID: string, count: number): Promise<void> {
  const state = await loadGlobalState();
  const idx = state.projects.findIndex((p) => p.id === projectID);
  if (idx < 0) return;
  state.projects[idx]!.instance_count = count;
  state.projects[idx]!.updated_at = new Date().toISOString();
  await saveGlobalState(state);
}

// ===== Legacy read (migration only) =====

/** Read the legacy single-file state.json. Returns null when the file is
 *  absent — callers treat that as "nothing to migrate". Never used by
 *  steady-state code paths. */
export async function loadLegacyState(): Promise<PersistedState | null> {
  try {
    const raw = await readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    let instances: InstanceData[] = [];
    if (Array.isArray(parsed.instances)) {
      instances = parsed.instances as InstanceData[];
    } else if (typeof parsed.instances === 'string') {
      instances = JSON.parse(parsed.instances) as InstanceData[];
    }
    return {
      help_screens_seen: parsed.help_screens_seen ?? 0,
      instances,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
