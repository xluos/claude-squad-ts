import { log } from '../shared/logger.js';
import { loadState, saveState } from '../shared/state.js';
import { guessBaseBranch } from './git/util.js';
import { Instance } from './instance.js';

export interface InstanceStorage {
  loadInstances(branchPrefix: string): Promise<Instance[]>;
  saveInstances(instances: Instance[]): Promise<void>;
  deleteInstance(title: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export function createStorage(): InstanceStorage {
  return {
    async loadInstances(branchPrefix: string): Promise<Instance[]> {
      const state = await loadState();
      // One-shot backfill: instances persisted before `base_branch_name`
      // existed have no fork-point recorded. For existing-branch worktrees
      // the answer is trivially their own branch; for new-from-HEAD ones
      // we ask git which branches contain the base SHA and pick a sane
      // candidate. Anything we fill gets saved back below so the lookup
      // only runs once per instance.
      let dirty = false;
      for (const data of state.instances) {
        const w = data.worktree;
        if (!w || w.base_branch_name) continue;
        if (w.is_existing_branch) {
          w.base_branch_name = w.branch_name;
          dirty = true;
          continue;
        }
        try {
          const guess = await guessBaseBranch(
            w.repo_path,
            w.base_commit_sha,
            w.branch_name,
            branchPrefix,
          );
          if (guess) {
            w.base_branch_name = guess;
            dirty = true;
          }
        } catch (err) {
          log.warn(`base-branch backfill failed for ${data.title}`, err);
        }
      }
      if (dirty) {
        try {
          await saveState(state);
        } catch (err) {
          log.warn('failed to persist base-branch backfill', err);
        }
      }

      const out: Instance[] = [];
      for (const data of state.instances) {
        try {
          out.push(Instance.fromPersisted(data, branchPrefix));
        } catch (err) {
          log.warn(`failed to restore instance ${data.title}`, err);
        }
      }
      return out;
    },

    async saveInstances(instances: Instance[]): Promise<void> {
      const state = await loadState();
      state.instances = instances.filter((i) => i.hasStarted()).map((i) => i.toPersisted());
      await saveState(state);
    },

    async deleteInstance(title: string): Promise<void> {
      const state = await loadState();
      state.instances = state.instances.filter((i) => i.title !== title);
      await saveState(state);
    },

    async deleteAll(): Promise<void> {
      const state = await loadState();
      state.instances = [];
      await saveState(state);
    },
  };
}
