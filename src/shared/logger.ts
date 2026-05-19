import { appendFile, writeFile } from 'node:fs/promises';
import { logFilePath } from './paths.js';

type Level = 'INFO' | 'WARNING' | 'ERROR';

let prefix = '';
let initialized = false;

export async function initLogger(opts: { daemon?: boolean } = {}): Promise<void> {
  prefix = opts.daemon ? '[DAEMON] ' : '';
  try {
    await writeFile(logFilePath(), '', { flag: 'a' });
  } catch {
    // ignore - logging is best-effort
  }
  initialized = true;
}

export function logFile(): string {
  return logFilePath();
}

async function write(level: Level, msg: string): Promise<void> {
  if (!initialized) return;
  const line = `${new Date().toISOString()} ${prefix}${level}: ${msg}\n`;
  try {
    await appendFile(logFilePath(), line);
  } catch {
    // best effort
  }
}

export const log = {
  info: (msg: string, ...args: unknown[]): void => {
    void write('INFO', formatArgs(msg, args));
  },
  warn: (msg: string, ...args: unknown[]): void => {
    void write('WARNING', formatArgs(msg, args));
  },
  error: (msg: string, ...args: unknown[]): void => {
    void write('ERROR', formatArgs(msg, args));
  },
};

function formatArgs(msg: string, args: unknown[]): string {
  if (args.length === 0) return msg;
  const parts = args.map((a) =>
    a instanceof Error
      ? `${a.message}\n${a.stack ?? ''}`
      : typeof a === 'string'
        ? a
        : JSON.stringify(a),
  );
  return `${msg} ${parts.join(' ')}`;
}

export function createThrottledLogger(intervalMs: number) {
  let last = 0;
  return {
    shouldLog(): boolean {
      const now = Date.now();
      if (now - last >= intervalMs) {
        last = now;
        return true;
      }
      return false;
    },
  };
}
