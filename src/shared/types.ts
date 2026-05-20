export const Status = {
  Running: 0,
  Ready: 1,
  Loading: 2,
  Paused: 3,
  /** Tmux session died out from under us (system reboot, OOM, manual kill,
   *  …). Worktree usually still intact, so resume can restart just tmux
   *  rather than rebuild everything. UI shows ✗ icon + recovery hint. */
  Error: 4,
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
    case Status.Error:
      return 'error';
  }
}

export interface DiffStats {
  added: number;
  removed: number;
  content?: string;
  error?: string;
}

/** Compact `git status` summary for the instance list row.
 *  Counts mirror starship's all_status segments: modified / untracked /
 *  staged / deleted / renamed / conflicted. Intent-to-add entries (left
 *  over from the diff path's `git add -N .`) are reclassified as
 *  untracked via porcelain=v2's index-hash field so the count stays
 *  honest across refresh ticks. */
export interface GitStatus {
  modified: number;
  untracked: number;
  staged: number;
  deleted: number;
  renamed: number;
  conflicted: number;
}

export interface WorktreeData {
  repo_path: string;
  worktree_path: string;
  session_name: string;
  branch_name: string;
  base_commit_sha: string;
  is_existing_branch: boolean;
  /**
   * Branch the worktree was forked from at creation time. Used by the
   * Diff tab's "based on …" chip and as the reverse-sync source. Optional
   * because state.json from older versions doesn't carry it — UI hides
   * the chip when missing.
   */
  base_branch_name?: string;
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

/** Legacy single-file format. Kept around for migration reads only —
 *  new code should consume `ProjectState` / `GlobalState` instead. */
export interface PersistedState {
  help_screens_seen: number;
  instances: InstanceData[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  repo_path: string;
  created_at: string;
  updated_at: string;
  instance_count: number;
}

export interface ProjectState {
  project: ProjectMeta;
  instances: InstanceData[];
}

export interface GlobalState {
  projects: ProjectMeta[];
  help_screens_seen: number;
  /** Bumped each time a one-shot migration completes. Currently:
   *  - 0 → never migrated
   *  - 1 → legacy `state.json` instances moved into per-project state files */
  last_migration_version: number;
}

export const APP_STATE = {
  Default: 0,
  New: 1,
  Prompt: 2,
  Help: 3,
  Confirm: 4,
  Merge: 5,
  Send: 6,
  Tmux: 7,
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
  /** UI language. `auto` (default) reads $LANG / $LC_ALL — anything starting
   *  with `zh` resolves to Chinese, otherwise English. Overrideable to a
   *  concrete code if the user prefers to ignore the system locale. */
  language?: 'en' | 'zh' | 'auto';
  profiles?: Profile[];
  llm?: LLMConfig;
}
