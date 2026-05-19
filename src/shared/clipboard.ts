import { spawn } from 'node:child_process';
import { log } from './logger.js';

/**
 * Best-effort write to the system clipboard.
 *
 * Mirrors the Go version's `atotto/clipboard.WriteAll` behaviour: tries
 * the most appropriate native helper for the platform and silently
 * tolerates failure (the user typically just won't paste anything). We
 * never throw — clipboard is a nice-to-have, not a correctness primitive.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  const candidates = pickCandidates();
  for (const [cmd, args] of candidates) {
    if (await tryPipe(cmd, args, text)) return true;
  }
  log.info(`clipboard: no working helper found on platform ${process.platform}`);
  return false;
}

function pickCandidates(): [string, string[]][] {
  switch (process.platform) {
    case 'darwin':
      return [['pbcopy', []]];
    case 'linux':
      return [
        // Prefer Wayland's helper if available, then X11.
        ['wl-copy', []],
        ['xclip', ['-selection', 'clipboard']],
        ['xsel', ['--clipboard', '--input']],
      ];
    case 'win32':
      return [['clip', []]];
    default:
      return [];
  }
}

function tryPipe(cmd: string, args: readonly string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      resolve(false);
      return;
    }
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    child.stdin?.end(text);
  });
}
