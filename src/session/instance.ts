import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { log } from '../shared/logger.js';
import { type DiffStats, type InstanceData, type LLMConfig, Status } from '../shared/types.js';
import { hasInitialCommit, isGitRepo } from './git/util.js';
import {
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

  private started = false;
  private tmux: TmuxSession | null = null;
  private worktree: Worktree | null = null;
  private monitor = new StatusMonitor();
  private readonly branchPrefix: string;

  constructor(init: {
    title: string;
    displayName?: string;
    path: string;
    program: string;
    branchPrefix: string;
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
      autoYes: opts.autoYes,
      branch: opts.branch,
      prompt: opts.prompt,
      width: opts.width,
      height: opts.height,
    });
  }

  static fromPersisted(data: InstanceData, branchPrefix: string): Instance {
    const inst = new Instance({
      title: data.title,
      // Backward compat: pre-dual-naming data has no display_name → use title.
      displayName: data.display_name || data.title,
      path: data.path,
      program: data.program,
      branchPrefix,
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
    return inst;
  }

  hasStarted(): boolean {
    return this.started;
  }

  isPaused(): boolean {
    return this.status === Status.Paused;
  }

  worktreePath(): string {
    return this.worktree?.data.worktree_path ?? '';
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
          );
        } else {
          this.worktree = await createWorktree({
            repoPath: this.path,
            sessionName: this.title,
            branchPrefix: this.branchPrefix,
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
    } finally {
      this.status = Status.Paused;
      this.updatedAt = new Date();
    }
  }

  async resume(): Promise<void> {
    if (!this.worktree || !this.tmux) {
      throw new Error('cannot resume: instance was never started');
    }
    if (await this.worktree.isBranchCheckedOut()) {
      throw new Error(`branch ${this.worktree.data.branch_name} is already checked out elsewhere`);
    }
    this.status = Status.Loading;
    try {
      await this.worktree.setup();
      if (!(await this.tmux.exists())) {
        await this.tmux.start(this.worktree.data.worktree_path);
      }
      this.status = Status.Running;
      this.updatedAt = new Date();
    } catch (err) {
      this.status = Status.Paused;
      throw err;
    }
  }

  async preview(): Promise<string> {
    if (!this.tmux) return '';
    return this.tmux.capture();
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
