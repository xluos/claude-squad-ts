import { DETACH_KEY_BYTE } from '../../shared/constants.js';

interface PtyLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): { dispose: () => void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void };
}

/**
 * Spawn `tmux attach -t name` via node-pty and bridge it to the host process's
 * stdin/stdout. Returns a detach() promise resolves when the user presses
 * Ctrl+Q (byte 0x11) or the tmux process exits.
 *
 * IMPORTANT: while attached, the host Ink instance must be unmounted /
 * stdin raw-mode released, otherwise both will fight for stdin.
 */
export async function attachTmux(
  name: string,
): Promise<{ detach: () => Promise<void>; done: Promise<void> }> {
  // Lazy import @lydell/node-pty so the rest of the app loads even if the
  // native binding is missing in non-attach paths.
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
  const stdout = process.stdout;
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  const onStdin = (chunk: Buffer): void => {
    // Detach on Ctrl+Q (single byte).
    if (chunk.length === 1 && chunk[0] === DETACH_KEY_BYTE) {
      void doDetach();
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
    stdout.write(d);
  });

  let resolvedDone: () => void = () => undefined;
  const done = new Promise<void>((res) => {
    resolvedDone = res;
  });

  let exited = false;
  const exitSub = pty.onExit(() => {
    if (exited) return;
    exited = true;
    cleanup();
    resolvedDone();
  });

  const cleanup = (): void => {
    dataSub.dispose();
    exitSub.dispose();
    stdin.off('data', onStdin);
    process.stdout.off('resize', onResize);
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
    stdin.pause();
  };

  const doDetach = async (): Promise<void> => {
    if (exited) return;
    exited = true;
    // Send tmux's own detach command (prefix + d). The simpler path is to kill
    // the attach process — tmux session itself stays alive because we used
    // `attach-session`, not `kill-session`.
    pty.kill();
    cleanup();
    resolvedDone();
  };

  return { detach: doDetach, done };
}
