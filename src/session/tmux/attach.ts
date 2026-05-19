import { DETACH_KEY_BYTE } from '../../shared/constants.js';

interface PtyLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): { dispose: () => void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void };
}

/**
 * Spawn `tmux attach-session -t name` via @lydell/node-pty and bridge it to
 * the host's stdin/stdout for the duration of the attach.
 *
 * Why PTY-bridge and not `stdio: 'inherit'`?
 *   - We want to intercept Ctrl+Q (byte 0x11) and detach without forwarding
 *     the byte to tmux (tmux would otherwise send it through to the agent).
 *     `stdio: 'inherit'` gives all bytes directly to tmux and cannot peek.
 *
 * Why this is safe to call now (it crashed when we first tried it):
 *   - The caller must `renderer.suspend()` the OpenTUI renderer before this
 *     runs. Suspend releases the global stdin listener (and exits the alt
 *     screen) so our `stdin.on('data', ...)` is the only consumer.
 *
 * Detach paths
 *   - User presses Ctrl+Q → byte 0x11 hits onStdin → we `pty.kill()` the
 *     attach process. The tmux *session* keeps running (we used
 *     attach-session, not kill-session).
 *   - User uses tmux's native prefix+d → tmux detaches; the attach process
 *     exits on its own; `done` resolves.
 *   - Agent inside tmux exits → tmux window destroyed → tmux session ends
 *     (with default config) → attach process exits → `done` resolves.
 */
export async function attachTmux(name: string): Promise<{ done: Promise<void> }> {
  const nodePty = (await import('@lydell/node-pty')) as unknown as {
    spawn: (
      file: string,
      args: readonly string[],
      opts: {
        name?: string;
        cols?: number;
        rows?: number;
        cwd?: string;
        env?: Record<string, string | undefined>;
      },
    ) => PtyLike;
  };

  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;

  const pty = nodePty.spawn('tmux', ['attach-session', '-t', name], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env,
  });

  const stdin = process.stdin;
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  let exited = false;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });

  const onStdin = (chunk: Buffer): void => {
    // Intercept Ctrl+Q so the byte never reaches tmux's pane.
    if (chunk.length === 1 && chunk[0] === DETACH_KEY_BYTE) {
      try {
        pty.kill('SIGTERM');
      } catch {
        // pty may already be exiting; the onExit handler will finalise.
      }
      return;
    }
    pty.write(chunk.toString('utf8'));
  };

  const onResize = (): void => {
    pty.resize(process.stdout.columns ?? cols, process.stdout.rows ?? rows);
  };

  stdin.on('data', onStdin);
  process.stdout.on('resize', onResize);
  const dataSub = pty.onData((d) => {
    process.stdout.write(d);
  });

  const cleanup = (): void => {
    stdin.off('data', onStdin);
    process.stdout.off('resize', onResize);
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
    stdin.pause();
    dataSub.dispose();
    exitSub.dispose();
  };

  const exitSub = pty.onExit(() => {
    if (exited) return;
    exited = true;
    cleanup();
    resolveDone();
  });

  return { done };
}
