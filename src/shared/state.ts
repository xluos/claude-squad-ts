import { readFile, writeFile } from 'node:fs/promises';
import { ensureAppDir, statePath } from './paths.js';
import type { InstanceData, PersistedState } from './types.js';

export function defaultState(): PersistedState {
  return { help_screens_seen: 0, instances: [] };
}

export async function loadState(): Promise<PersistedState> {
  await ensureAppDir();
  try {
    const raw = await readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    // Original Go stores `instances` as RawMessage; tolerate both array and string-encoded array.
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
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultState();
    }
    throw err;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  await ensureAppDir();
  await writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
}

export async function markHelpSeen(bit: number): Promise<PersistedState> {
  const state = await loadState();
  state.help_screens_seen |= bit;
  await saveState(state);
  return state;
}

export function helpAlreadySeen(state: PersistedState, bit: number): boolean {
  return (state.help_screens_seen & bit) !== 0;
}
