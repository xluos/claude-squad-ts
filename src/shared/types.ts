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
  /**
   * User-facing display name; can contain CJK / non-ASCII characters.
   * Title remains an ASCII-safe identifier used for tmux session + git branch.
   * For backwards compatibility, when missing we fall back to title at load time.
   */
  display_name?: string;
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
  Merge: 5,
} as const;
export type AppStateValue = (typeof APP_STATE)[keyof typeof APP_STATE];

export interface Profile {
  name: string;
  program: string;
}

export interface LLMConfig {
  /** API key for the LLM service. */
  api_key?: string;
  /** Model name. */
  model?: string;
  /** Base URL of an OpenAI-compatible /chat/completions endpoint. */
  base_url?: string;
  /** Master switch. When false, translation is skipped entirely. */
  enabled: boolean;
  /** Request timeout in seconds. Defaults to 30. */
  timeout?: number;
  /** Whether to ask the API for streaming responses. Default false. */
  stream?: boolean;
  /** Some Chinese vendors use this flag to disable internal CoT scaffolding. */
  enable_thinking?: boolean;
}

export interface AppConfig {
  default_program: string;
  auto_yes: boolean;
  daemon_poll_interval: number;
  branch_prefix: string;
  profiles?: Profile[];
  llm?: LLMConfig;
}
