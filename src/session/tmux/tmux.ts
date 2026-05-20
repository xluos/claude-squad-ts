import { TMUX_HISTORY_LIMIT, TMUX_PREFIX } from '../../shared/constants.js';
import { runCmd } from '../git/exec.js';

export function sanitizeTmuxName(title: string): string {
  return title.replace(/\s+/g, '').replace(/\./g, '_');
}

export function tmuxNameOf(title: string): string {
  return `${TMUX_PREFIX}${sanitizeTmuxName(title)}`;
}

/**
 * Lists every live tmux session that we own (i.e. whose name begins with
 * `TMUX_PREFIX`). Returns `[]` if no tmux server is running or the command
 * fails — we don't want a tmux hiccup to crash the metadata tick.
 */
export async function listLiveTmuxSessions(): Promise<string[]> {
  const r = await runCmd('tmux', ['list-sessions', '-F', '#{session_name}']);
  if (r.code !== 0) return [];
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(TMUX_PREFIX));
}

export interface TmuxSessionInfo {
  name: string;
  /** Unix seconds — `tmux #{session_created}`. 0 if unknown. */
  createdAt: number;
  /** Unix seconds of the most recent activity in any pane. 0 if unknown. */
  activityAt: number;
  windows: number;
  /** `1` if any client is attached, otherwise `0`. */
  attached: boolean;
  width: number;
  height: number;
  /** Foreground process running in the (first) pane, e.g. `claude`, `aider`. */
  command: string;
}

/**
 * Richer variant of `listLiveTmuxSessions` returning per-session metadata
 * for the tmux manager overlay. Fields are populated via `tmux list-sessions
 * -F`; the foreground command is read from `tmux list-panes` since
 * `#{pane_current_command}` only resolves correctly when scoped to a pane.
 */
export async function listLiveTmuxSessionInfos(): Promise<TmuxSessionInfo[]> {
  // `\x01` (SOH) is used as the field separator: tmux session names are
  // sanitized to `[A-Za-z0-9_]` (see `sanitizeTmuxName`) so no name can
  // ever contain a SOH byte, and it doesn't appear in normal output either.
  const FS = '\x01';
  const fmt = [
    '#{session_name}',
    '#{session_created}',
    '#{session_activity}',
    '#{session_windows}',
    '#{session_attached}',
    '#{session_width}',
    '#{session_height}',
  ].join(FS);
  const r = await runCmd('tmux', ['list-sessions', '-F', fmt]);
  if (r.code !== 0) return [];
  const rows = r.stdout.split('\n').filter((l) => l.length > 0);
  const out: TmuxSessionInfo[] = [];
  for (const row of rows) {
    const parts = row.split(FS);
    if (parts.length < 7) continue;
    const name = parts[0]!.trim();
    if (!name.startsWith(TMUX_PREFIX)) continue;
    out.push({
      name,
      createdAt: Number(parts[1]) || 0,
      activityAt: Number(parts[2]) || 0,
      windows: Number(parts[3]) || 0,
      attached: parts[4] !== '0' && parts[4] !== '',
      width: Number(parts[5]) || 0,
      height: Number(parts[6]) || 0,
      command: '',
    });
  }
  // Look up the foreground command of each session's active pane in a
  // single call per session. We could do it in one shot via
  // `list-panes -a -F '#{session_name}|#{pane_active}|#{pane_current_command}'`
  // and filter pane_active=1 — that's one fork instead of N. Worth doing
  // if N grows, but for the typical < 20 sessions the per-session call is
  // simpler.
  await Promise.all(
    out.map(async (info) => {
      const p = await runCmd('tmux', [
        'list-panes',
        '-t',
        info.name,
        '-F',
        '#{pane_active} #{pane_current_command}',
      ]);
      if (p.code !== 0) return;
      for (const line of p.stdout.split('\n')) {
        const m = /^(\d+)\s+(.+)$/.exec(line.trim());
        if (m && m[1] === '1') {
          info.command = m[2]!.trim();
          return;
        }
      }
    }),
  );
  return out;
}

/**
 * Kills a tmux session by name. Returns `true` on success (or if the
 * session was already gone), `false` otherwise. Mirrors the resilience of
 * `TmuxSession.close` but doesn't require an `Instance` to call into.
 */
export async function killTmuxSession(name: string): Promise<boolean> {
  const r = await runCmd('tmux', ['kill-session', '-t', name]);
  if (r.code === 0) return true;
  // tmux returns non-zero if the session doesn't exist; that's still
  // "gone" from the caller's perspective. Detect by re-checking.
  const probe = await runCmd('tmux', ['has-session', `-t=${name}`]);
  return probe.code !== 0;
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
    // Pin window size to whatever WE resize-window to. Without this,
    // tmux's default `window-size latest` makes the window track the
    // most recently attached client — so after the user detaches, the
    // pane keeps the attach-time dimensions, our explicit resize-back
    // to preview dims is silently ignored, and the Preview area ends
    // up smaller than the actual pane → `visibleLines` slices off the
    // top rows of content. Manual mode honours every resize-window
    // we issue.
    await runCmd('tmux', ['set-option', '-t', this.name, 'window-size', 'manual']);
    await runCmd('tmux', ['set-option', '-t', this.name, 'status', 'off']);
    await ensureDetachBinding();
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
    // Ensure window-size is manual before resizing. For brand-new
    // sessions start() already sets this, but sessions restored from
    // state.json never went through start() (the tmux session was
    // already alive from a previous run), so they may still be on the
    // default `latest` policy — which would silently ignore our
    // resize as soon as a client detaches. Idempotent and cheap.
    await runCmd('tmux', ['set-option', '-t', this.name, 'window-size', 'manual']).catch(
      () => undefined,
    );
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

/**
 * Bind Ctrl+Q (no prefix) → detach-client on the tmux server.
 *
 * The `root` key table is server-wide, so a single bind covers every
 * session this server hosts — including ones we restored from state.json
 * without going through `start()`. Idempotent: tmux just overwrites the
 * existing binding each call.
 *
 * Why server-wide is acceptable here: claude-squad's tmux sessions all
 * benefit from Ctrl+Q-to-detach, and the user's own ad-hoc tmux sessions
 * (if any) gain a reasonable shortcut for the same action.
 *
 * Why a tmux-side binding instead of stdin interception: see attach.ts
 * — Bun + node-pty drops the first redraw bytes due to a tty-stream
 * timing race, so attach has to run with stdio: 'inherit'.
 */
export async function ensureDetachBinding(): Promise<void> {
  await runCmd('tmux', ['bind-key', '-T', 'root', 'C-q', 'detach-client']).catch(() => undefined);
}
