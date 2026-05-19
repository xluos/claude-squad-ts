import { log } from '../shared/logger.js';
import { loadState, saveState } from '../shared/state.js';
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
