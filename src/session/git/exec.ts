import { spawn } from 'node:child_process';

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runGit(args: string[], opts: { cwd?: string } = {}): Promise<GitResult> {
  return runCmd('git', args, opts);
}

export async function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string } = {},
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        code: code ?? 0,
      });
    });
    if (opts.input !== undefined) {
      child.stdin.end(opts.input);
    } else {
      child.stdin.end();
    }
  });
}

export class CmdError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly args: readonly string[],
    public readonly result: GitResult,
  ) {
    super(
      `${cmd} ${args.join(' ')} exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`,
    );
    this.name = 'CmdError';
  }
}

export function ensureOk(cmd: string, args: string[], r: GitResult): GitResult {
  if (r.code !== 0) throw new CmdError(cmd, args, r);
  return r;
}
