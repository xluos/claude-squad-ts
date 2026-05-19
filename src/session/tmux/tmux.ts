import { TMUX_HISTORY_LIMIT, TMUX_PREFIX } from '../../shared/constants.js';
import { runCmd } from '../git/exec.js';

export function sanitizeTmuxName(title: string): string {
  return title.replace(/\s+/g, '').replace(/\./g, '_');
}

export function tmuxNameOf(title: string): string {
  return `${TMUX_PREFIX}${sanitizeTmuxName(title)}`;
}

export interface CaptureOpts {
  start?: string;
  end?: string;
}

export class TmuxSession {
  readonly name: string;

  constructor(
    readonly title: string,
    public program: string,
  ) {
    this.name = tmuxNameOf(title);
  }

  async exists(): Promise<boolean> {
    const r = await runCmd('tmux', ['has-session', `-t=${this.name}`]);
    return r.code === 0;
  }

  async start(workDir: string): Promise<void> {
    if (await this.exists()) {
      throw new Error(`tmux session ${this.name} already exists`);
    }
    // tmux new-session -d -s NAME -c DIR PROGRAM
    // The program string may contain its own args ("aider --model X"), so let the shell parse it.
    const args = ['new-session', '-d', '-s', this.name, '-c', workDir, 'sh', '-lc', this.program];
    const r = await runCmd('tmux', args);
    if (r.code !== 0) {
      throw new Error(`failed to start tmux session: ${r.stderr.trim()}`);
    }
    await this.waitForSession(2000);
    await runCmd('tmux', [
      'set-option',
      '-t',
      this.name,
      'history-limit',
      String(TMUX_HISTORY_LIMIT),
    ]);
    await runCmd('tmux', ['set-option', '-t', this.name, 'mouse', 'on']);
  }

  async close(): Promise<void> {
    if (!(await this.exists())) return;
    await runCmd('tmux', ['kill-session', '-t', this.name]);
  }

  async capture(opts: CaptureOpts = {}): Promise<string> {
    const args = ['capture-pane', '-p', '-e', '-J'];
    if (opts.start !== undefined) {
      args.push('-S', opts.start);
    }
    if (opts.end !== undefined) {
      args.push('-E', opts.end);
    }
    args.push('-t', this.name);
    const r = await runCmd('tmux', args);
    if (r.code !== 0) return '';
    return r.stdout;
  }

  async sendKeys(text: string): Promise<void> {
    if (text.length === 0) return;
    await runCmd('tmux', ['send-keys', '-t', this.name, '-l', text]);
  }

  async sendEnter(): Promise<void> {
    await runCmd('tmux', ['send-keys', '-t', this.name, 'Enter']);
  }

  async sendDAndEnter(): Promise<void> {
    await runCmd('tmux', ['send-keys', '-t', this.name, 'D', 'Enter']);
  }

  async resize(cols: number, rows: number): Promise<void> {
    await runCmd('tmux', [
      'resize-window',
      '-t',
      this.name,
      '-x',
      String(cols),
      '-y',
      String(rows),
    ]);
  }

  private async waitForSession(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let backoff = 5;
    while (Date.now() < deadline) {
      if (await this.exists()) return;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 50);
    }
    throw new Error(`tmux session ${this.name} did not start within ${timeoutMs}ms`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
