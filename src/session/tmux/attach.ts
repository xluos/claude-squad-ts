/**
 * Run `tmux attach-session -t name` and resolve once the user detaches.
 *
 * Implementation history:
 *   v1 — `stdio: 'inherit'` via child_process. Worked but no way to grab
 *        Ctrl+Q before tmux saw it.
 *   v2 — `@lydell/node-pty` to bridge stdin/stdout and intercept the
 *        Ctrl+Q byte. Worked on Node but broke on Bun: node-pty's
 *        `_forwardEvents` attaches a tty.ReadStream 'data' listener
 *        inside the UnixTerminal constructor, putting the stream in
 *        flowing mode. By the time our caller hooks `pty.onData(...)`
 *        the first redraw bytes (alt-screen-enter + pane redraw) are
 *        already gone — the user saw a blank screen. The
 *        `_onData.fire()` event emitter has no buffer.
 *   v3 — this one. We're back to `stdio: 'inherit'` and let tmux own
 *        the terminal directly (most reliable code path). Ctrl+Q
 *        detach is implemented as a tmux key-table binding instead
 *        (see tmux.ts `start()`), so we don't need to peek at stdin.
 *
 * Detach paths
 *   - User presses Ctrl+Q → tmux's own `bind-key -T root C-q
 *     detach-client` fires. The tmux *session* stays running.
 *   - User uses tmux's native prefix+d → same outcome.
 *   - Agent inside tmux exits → tmux window destroyed → session ends
 *     (with default config) → attach process exits.
 */
export async function attachTmux(name: string): Promise<{ done: Promise<void> }> {
  const proc = Bun.spawn(['tmux', 'attach-session', '-t', name], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const done = proc.exited.then(() => undefined);
  return { done };
}
