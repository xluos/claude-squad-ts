import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { log } from '../shared/logger.js';
import {
  type DiffStats,
  type GitStatus,
  type InstanceData,
  type LLMConfig,
  Status,
} from '../shared/types.js';
import type { CommitMessageProvider } from './git/commit-hook.js';
import { hasInitialCommit, isGitRepo } from './git/util.js';
import {
  type CommitCounts,
  createWorktree,
  createWorktreeFromBranch,
  type Worktree,
  worktreeFromData,
} from './git/worktree.js';
import { hasNonAscii, translateToEnglishId } from './llm/translator.js';
import { detectTrustPrompt, StatusMonitor } from './tmux/monitor.js';
import { TmuxSession } from './tmux/tmux.js';

export interface NewInstanceOpts {
  /**
   * User-supplied name. May contain CJK / non-ASCII. The constructor will
   * derive an ASCII-safe `title` from it (via LLM when configured) and keep
   * the original as `displayName`.
   */
  title: string;
  path: string;
  program: string;
  branchPrefix: string;
  /** Project this instance belongs to (resolved from the host repo at
   *  CLI entry). Scopes the on-disk worktree path. */
  projectID: string;
  autoYes?: boolean;
  /** Use this existing branch instead of cutting a new one from HEAD. */
  branch?: string;
  /** Initial prompt to type after the program is ready. */
  prompt?: string;
  width?: number;
  height?: number;
  /** LLM config for CJK → ASCII translation; pass undefined to disable. */
  llm?: LLMConfig;
}

export class Instance {
  title: string;
  /** User-facing name; may contain CJK. Defaults to title for pure-ASCII input. */
  displayName: string;
  path: string;
  branch: string;
  status: Status;
  program: string;
  height: number;
  width: number;
  createdAt: Date;
  updatedAt: Date;
  autoYes: boolean;
  prompt: string;
  selectedBranch: string;
  diffStats: DiffStats;
  /** Commit divergence vs the host repo's current branch since the worktree
   *  was cut. Refreshed by the periodic metadata loop and after merges. */
  commitStats: CommitCounts = { ahead: 0, behind: 0 };
  /** Transient flag: an async operation (merge/apply/sync hook) is in
   *  progress. The list row shows a secondary indicator without replacing
   *  the original status icon. */
  busy = false;
  /** Timestamp of last auto-pull failure. Used to suppress retries for a
   *  cooldown period so a persistent error doesn't cause spinner flicker. */
  autoPullFailedAt = 0;
  /** `git status` bucket counts for the list-row bracket. Refreshed on the
   *  same metadata tick as diffStats. Zero-initialised so freshly-created
   *  instances render a clean (collapsed) bracket until the first tick. */
  gitStatus: GitStatus = {
    modified: 0,
    untracked: 0,
    staged: 0,
    deleted: 0,
    renamed: 0,
    conflicted: 0,
  };

  private started = false;
  private tmux: TmuxSession | null = null;
  private worktree: Worktree | null = null;
  private monitor = new StatusMonitor();
  private readonly branchPrefix: string;
  private readonly projectID: string;

  constructor(init: {
    title: string;
    displayName?: string;
    path: string;
    program: string;
    branchPrefix: string;
    projectID: string;
    autoYes?: boolean;
    branch?: string;
    prompt?: string;
    width?: number;
    height?: number;
    status?: Status;
    createdAt?: Date;
    updatedAt?: Date;
    diffStats?: DiffStats;
    worktree?: Worktree;
    branchName?: string;
  }) {
    this.title = init.title;
    this.displayName = init.displayName ?? init.title;
    this.path = init.path;
    this.program = init.program;
    this.branchPrefix = init.branchPrefix;
    this.projectID = init.projectID;
    this.autoYes = init.autoYes ?? false;
    this.selectedBranch = init.branch ?? '';
    this.prompt = init.prompt ?? '';
    this.width = init.width ?? 80;
    this.height = init.height ?? 24;
    this.status = init.status ?? Status.Ready;
    this.createdAt = init.createdAt ?? new Date();
    this.updatedAt = init.updatedAt ?? new Date();
    this.diffStats = init.diffStats ?? { added: 0, removed: 0 };
    this.branch = init.branchName ?? '';
    if (init.worktree) this.worktree = init.worktree;
  }

  /**
   * Create a new Instance from user input. If the title contains non-ASCII
   * characters, the LLM (when configured) translates it to a kebab-case
   * English ID; otherwise we fall back to `session-<unixtime>`. In either
   * case the original input is preserved as `displayName`.
   */
  static async create(opts: NewInstanceOpts): Promise<Instance> {
    if (!(await isGitRepo(opts.path))) {
      throw new Error(`${opts.path} is not a git repository`);
    }
    if (!(await hasInitialCommit(opts.path))) {
      throw new Error(
        'this appears to be a brand new repository: please create an initial commit before creating an instance',
      );
    }

    const userInput = opts.title.trim();
    let title = userInput;
    const displayName = userInput;
    if (hasNonAscii(userInput)) {
      try {
        title = await translateToEnglishId(userInput, opts.llm);
      } catch (err) {
        log.warn('LLM translation threw', err);
        title = `session-${Math.floor(Date.now() / 1000)}`;
      }
      log.info(`translated session name "${userInput}" -> "${title}"`);
    }

    return new Instance({
      title,
      displayName,
      path: opts.path,
      program: opts.program,
      branchPrefix: opts.branchPrefix,
      projectID: opts.projectID,
      autoYes: opts.autoYes,
      branch: opts.branch,
      prompt: opts.prompt,
      width: opts.width,
      height: opts.height,
    });
  }

  static fromPersisted(data: InstanceData, branchPrefix: string, projectID: string): Instance {
    const inst = new Instance({
      title: data.title,
      // Backward compat: pre-dual-naming data has no display_name → use title.
      displayName: data.display_name || data.title,
      path: data.path,
      program: data.program,
      branchPrefix,
      projectID,
      autoYes: data.auto_yes,
      branch: data.worktree.branch_name,
      branchName: data.branch,
      width: data.width,
      height: data.height,
      status: data.status,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      diffStats: data.diff_stats ?? { added: 0, removed: 0 },
      worktree: worktreeFromData(data.worktree),
    });
    // A persisted instance has, by definition, passed through start()
    // at least once — otherwise it wouldn't be in state.json. Without
    // this flip, paused instances (which skip the post-load start()
    // call) would still report `started=false` and the next call to
    // `saveInstances` would drop them via its hasStarted filter,
    // silently wiping every paused row from state.json.
    inst.started = true;
    return inst;
  }

  hasStarted(): boolean {
    return this.started;
  }

  isPaused(): boolean {
    return this.status === Status.Paused;
  }

  /**
   * Whether the worktree has uncommitted changes. Read-only — used by
   * the merge overlay to warn the user that a confirm will auto-commit
   * pending edits before the actual merge runs.
   */
  async isDirty(): Promise<boolean> {
    if (!this.worktree) return false;
    return this.worktree.isDirty();
  }

  /**
   * If the worktree has uncommitted changes, commit them all to the
   * instance's branch with the given message. Returns true when a
   * commit was actually made. Pre-merge / pre-checkout flows call this
   * so the agent's in-flight edits don't get stranded as "dirty but
   * not on any branch".
   */
  async commitDirty(msg: string, getMessage?: CommitMessageProvider): Promise<boolean> {
    if (!this.worktree) return false;
    if (!(await this.worktree.isDirty())) return false;
    await this.worktree.commit(msg, getMessage);
    return true;
  }

  worktreePath(): string {
    return this.worktree?.data.worktree_path ?? '';
  }

  /**
   * Branch the worktree was forked from at creation time. Empty when the
   * worktree predates the `base_branch_name` field (legacy state.json) or
   * when host was in detached HEAD when this instance was created — the
   * UI hides the "based on …" chip in that case.
   */
  baseBranch(): string {
    return this.worktree?.data.base_branch_name ?? '';
  }

  /**
   * Start the instance.
   * @param firstTime  true when called from the new-instance flow (creates a fresh worktree).
   *                   false when restoring from persisted state.
   */
  async start(firstTime: boolean): Promise<void> {
    this.status = Status.Loading;
    try {
      if (firstTime) {
        if (this.selectedBranch) {
          this.worktree = await createWorktreeFromBranch(
            this.path,
            this.selectedBranch,
            this.title,
            this.projectID,
          );
        } else {
          this.worktree = await createWorktree({
            repoPath: this.path,
            sessionName: this.title,
            branchPrefix: this.branchPrefix,
            projectID: this.projectID,
          });
        }
        await this.worktree.setup();
        this.branch = this.worktree.data.branch_name;
      } else if (!this.worktree) {
        throw new Error('cannot restore instance without persisted worktree data');
      }

      this.tmux = new TmuxSession(this.title, this.program);
      const sessionAlreadyExists = await this.tmux.exists();
      if (!sessionAlreadyExists) {
        await this.tmux.start(this.worktree.data.worktree_path);
      }

      if (firstTime && this.prompt) {
        // Give the program a moment to boot before injecting the prompt.
        await sleep(500);
        await this.tmux.sendKeys(this.prompt);
        await sleep(100);
        await this.tmux.sendEnter();
      }

      this.status = Status.Running;
      this.started = true;
      this.updatedAt = new Date();
    } catch (err) {
      this.status = Status.Ready;
      throw err;
    }
  }

  async kill(): Promise<void> {
    if (this.tmux) await this.tmux.close();
    if (this.worktree) await this.worktree.cleanup();
    this.started = false;
  }

  async pause(): Promise<void> {
    if (!this.worktree || !this.tmux) return;
    // Synchronous status flip *before* the first await so callers can
    // bumpRev() immediately and the spinner shows up — large worktrees
    // can otherwise stall the UI silently for several seconds.
    const previousStatus = this.status;
    this.status = Status.Loading;
    try {
      if (await this.worktree.isValid()) {
        if (await this.worktree.isDirty()) {
          await this.worktree.commit(`[claudesquad] auto-commit on pause of ${this.title}`);
        }
        await this.worktree.remove();
      } else {
        log.warn(`worktree ${this.worktree.data.worktree_path} missing — force-removing dir`);
        if (existsSync(this.worktree.data.worktree_path)) {
          await rm(this.worktree.data.worktree_path, { recursive: true, force: true });
        }
        await this.worktree.prune();
      }
      this.status = Status.Paused;
      this.updatedAt = new Date();
    } catch (err) {
      // Roll back on failure — if the worktree is still on disk we're not
      // really paused, and showing Paused would let the user trip into
      // resume() flows that immediately fail.
      this.status = previousStatus;
      throw err;
    }
  }

  async resume(): Promise<void> {
    if (!this.worktree || !this.tmux) {
      throw new Error('cannot resume: instance was never started');
    }
    // Error recovery: tmux died but worktree is still on disk. Just
    // restart tmux against the existing worktree — no need to rebuild.
    if (this.status === Status.Error) {
      await this.restartTmux();
      return;
    }
    if (await this.worktree.isBranchCheckedOut()) {
      throw new Error(`branch ${this.worktree.data.branch_name} is already checked out elsewhere`);
    }
    const previousStatus = this.status;
    this.status = Status.Loading;
    try {
      await this.worktree.setup();
      if (!(await this.tmux.exists())) {
        await this.tmux.start(this.worktree.data.worktree_path);
      }
      this.status = Status.Running;
      this.updatedAt = new Date();
    } catch (err) {
      this.status = previousStatus;
      throw err;
    }
  }

  /**
   * Reattach a tmux session against the existing worktree, used by
   * Error-state recovery. Doesn't touch the worktree on disk — the
   * common case is "tmux died, worktree is fine".
   */
  async restartTmux(): Promise<void> {
    if (!this.tmux || !this.worktree) {
      throw new Error('cannot restart tmux: instance was never started');
    }
    const previousStatus = this.status;
    this.status = Status.Loading;
    try {
      // `tmux.start` is idempotent only when the session is missing —
      // if a zombie still claims the name we'd silently re-bind to it.
      // Force a fresh start to ensure we actually own the new session.
      if (await this.tmux.exists()) {
        await this.tmux.close();
      }
      await this.tmux.start(this.worktree.data.worktree_path);
      this.status = Status.Running;
      this.updatedAt = new Date();
    } catch (err) {
      this.status = previousStatus;
      throw err;
    }
  }

  async preview(): Promise<string> {
    if (!this.tmux) return '';
    return this.tmux.capture();
  }

  /**
   * Resize the detached tmux session so its virtual terminal matches the
   * preview viewport. Required to make agents (Claude Code, aider, etc.)
   * lay their UI out at the width we're going to display — otherwise tmux
   * defaults to 80x24, the captured lines are 80 cells wide, and our
   * narrower preview pane has to truncate / wrap them.
   *
   * Cheap to call repeatedly; tmux is a no-op when the size is unchanged.
   */
  async resizeTmux(cols: number, rows: number): Promise<void> {
    if (!this.tmux || cols <= 0 || rows <= 0) return;
    this.width = cols;
    this.height = rows;
    await this.tmux.resize(cols, rows);
  }

  async previewFullHistory(): Promise<string> {
    if (!this.tmux) return '';
    return this.tmux.capture({ start: '-', end: '-' });
  }

  async hasUpdated(): Promise<{ changed: boolean; hasPrompt: boolean }> {
    if (!this.tmux) return { changed: false, hasPrompt: false };
    const content = await this.tmux.capture();
    return this.monitor.observe(content);
  }

  async checkAndHandleTrustPrompt(): Promise<boolean> {
    if (!this.tmux) return false;
    const content = await this.tmux.capture();
    const reply = detectTrustPrompt(content);
    if (!reply) return false;
    if (reply === 'd-enter') await this.tmux.sendDAndEnter();
    else await this.tmux.sendEnter();
    return true;
  }

  async computeDiff(): Promise<DiffStats> {
    if (!this.worktree) return { added: 0, removed: 0 };
    const stats = await this.worktree.diff();
    this.diffStats = stats;
    return stats;
  }

  async computeDiffNumstat(): Promise<DiffStats> {
    if (!this.worktree) return { added: 0, removed: 0 };
    const stats = await this.worktree.diffNumstat();
    this.diffStats = { ...this.diffStats, added: stats.added, removed: stats.removed };
    return stats;
  }

  async updateDiffBase(): Promise<void> {
    if (this.worktree) await this.worktree.updateDiffBase();
  }

  async computeCommitStats(): Promise<CommitCounts> {
    if (!this.worktree) return { ahead: 0, behind: 0 };
    const stats = await this.worktree.commitCounts();
    this.commitStats = stats;
    return stats;
  }

  async computeGitStatus(): Promise<GitStatus> {
    if (!this.worktree) return { ...this.gitStatus };
    const s = await this.worktree.status();
    this.gitStatus = s;
    return s;
  }

  async sendPrompt(prompt: string): Promise<void> {
    if (!this.tmux) throw new Error('instance not started');
    await this.tmux.sendKeys(prompt);
    await sleep(100);
    await this.tmux.sendEnter();
  }

  async tapEnter(): Promise<void> {
    if (!this.tmux) return;
    await this.tmux.sendEnter();
  }

  async tmuxAlive(): Promise<boolean> {
    if (!this.tmux) return false;
    return this.tmux.exists();
  }

  /**
   * Reconcile the in-memory status with what tmux actually says. If the
   * tmux session has died (e.g. the agent ran `exit`, or the user killed
   * the tmux session manually) while we thought it was Running, promote
   * to Status.Error so the UI shows the recoverable-failure icon — the
   * user can then press `r` to restart tmux against the still-on-disk
   * worktree without rebuilding from scratch.
   *
   * Returns true if the underlying tmux is alive, false otherwise.
   */
  async checkAlive(): Promise<boolean> {
    if (!this.tmux) return false;
    // Paused sessions intentionally have no tmux right now — that's fine.
    if (this.isPaused()) return true;
    const alive = await this.tmux.exists();
    if (!alive && this.status === Status.Running) {
      this.status = Status.Error;
      this.updatedAt = new Date();
    }
    return alive;
  }

  isError(): boolean {
    return this.status === Status.Error;
  }

  getWorktree(): Worktree {
    if (!this.worktree) throw new Error('instance has no worktree');
    return this.worktree;
  }

  async pushChanges(commitMsg: string, open: boolean): Promise<void> {
    if (!this.worktree) throw new Error('instance has no worktree');
    await this.worktree.pushAndOpen(commitMsg, open);
  }

  toPersisted(): InstanceData {
    if (!this.worktree) throw new Error('cannot persist unstarted instance');
    return {
      title: this.title,
      display_name: this.displayName,
      path: this.path,
      branch: this.branch,
      status: this.status,
      height: this.height,
      width: this.width,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      auto_yes: this.autoYes,
      program: this.program,
      worktree: this.worktree.data,
      diff_stats: this.diffStats,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
