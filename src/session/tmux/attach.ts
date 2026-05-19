import { spawn } from 'node:child_process';

/**
 * Spawn `tmux attach-session -t name` with stdio fully inherited from this
 * process. Tmux itself owns the terminal, the alt screen buffer, raw mode,
 * mouse protocol, etc. for the duration of the attach — no node-pty / no
 * manual event bridging.
 *
 * IMPORTANT: the caller is responsible for letting tmux *have* the terminal:
 * the OpenTUI renderer must be suspended (it must have emitted the
 * `\x1b[?1049l` leave-alt-screen sequence and released stdin raw mode)
 * before calling, otherwise two consumers fight for stdin and the screen
 * stays blank because OpenTUI keeps overwriting tmux's output.
 *
 * Detach is whatever tmux's prefix-binding does (default `Ctrl+B d`).
 * When the user detaches, the spawned tmux process exits and the returned
 * `done` promise resolves.
 */
export function attachTmux(name: string): Promise<{ done: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const child = spawn('tmux', ['attach-session', '-t', name], {
      stdio: 'inherit',
      env: process.env,
    });

    const done = new Promise<void>((doneResolve, doneReject) => {
      child.on('error', (err) => doneReject(err));
      child.on('exit', (code, signal) => {
        if (code === 0 || code === null || signal !== null) doneResolve();
        else doneReject(new Error(`tmux attach exited with code ${code}`));
      });
    });

    // Resolve the outer promise as soon as the child is spawned — the caller
    // will await `done` to know when the user has detached.
    child.once('spawn', () => resolve({ done }));
    child.once('error', (err) => reject(err));
  });
}
