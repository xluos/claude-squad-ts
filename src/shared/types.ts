export const Status = {
  Running: 0,
  Ready: 1,
  Loading: 2,
  Paused: 3,
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export function statusLabel(s: Status): string {
  switch (s) {
    case Status.Running:
      return 'running';
    case Status.Ready:
      return 'ready';
    case Status.Loading:
      return 'loading';
    case Status.Paused:
      return 'paused';
  }
}

export interface DiffStats {
  added: number;
  removed: number;
  content?: string;
  error?: string;
}

export interface WorktreeData {
  repo_path: string;
  worktree_path: string;
  session_name: string;
  branch_name: string;
  base_commit_sha: string;
  is_existing_branch: boolean;
}

export interface InstanceData {
  title: string;
  path: string;
  branch: string;
  status: Status;
  height: number;
  width: number;
  created_at: string;
  updated_at: string;
  auto_yes: boolean;
  program: string;
  worktree: WorktreeData;
  diff_stats?: DiffStats;
}

export interface PersistedState {
  help_screens_seen: number;
  instances: InstanceData[];
}

export const APP_STATE = {
  Default: 0,
  New: 1,
  Prompt: 2,
  Help: 3,
  Confirm: 4,
} as const;
export type AppStateValue = (typeof APP_STATE)[keyof typeof APP_STATE];

export interface Profile {
  name: string;
  program: string;
}

export interface AppConfig {
  default_program: string;
  auto_yes: boolean;
  daemon_poll_interval: number;
  branch_prefix: string;
  profiles?: Profile[];
}
