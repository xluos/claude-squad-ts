import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test the internal helpers by importing them directly and by spawning the
// real CLI in a subprocess with $HOME overridden so we never touch the user's
// actual config.

const BUN = process.execPath;
const CLI = join(import.meta.dir, '..', 'src', 'cli', 'index.ts');

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), 'cs-cfg-'));
});

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true });
});

function run(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const r = Bun.spawnSync([BUN, 'run', CLI, 'config', ...args], {
    env: { ...process.env, HOME: tmpHome },
    cwd: import.meta.dir,
  });
  return {
    stdout: r.stdout.toString(),
    stderr: r.stderr.toString(),
    exitCode: r.exitCode,
  };
}

function json(out: string): unknown {
  return JSON.parse(out);
}

// ---------------------------------------------------------------------------
// config path
// ---------------------------------------------------------------------------

describe('config path', () => {
  test('returns the config file path under $HOME', () => {
    const r = run('path');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { config_path: string };
    expect(data.config_path).toContain('.claude-squad');
    expect(data.config_path).toEndWith('config.json');
  });
});

// ---------------------------------------------------------------------------
// config schema
// ---------------------------------------------------------------------------

describe('config schema', () => {
  test('outputs fields array with path/type/description/default/current', () => {
    const r = run('schema');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as {
      config_path: string;
      usage: Record<string, string>;
      fields: Array<{ path: string; type: string; description: string }>;
    };
    expect(data.config_path).toBeTruthy();
    expect(data.usage).toBeTruthy();
    expect(data.fields.length).toBeGreaterThan(10);

    const prog = data.fields.find((f) => f.path === 'default_program');
    expect(prog).toBeTruthy();
    expect(prog!.type).toBe('string');

    const lang = data.fields.find((f) => f.path === 'language');
    expect(lang).toBeTruthy();
    expect((lang as Record<string, unknown>).enum).toEqual(['en', 'zh', 'auto']);
  });

  test('includes usage instructions for AI', () => {
    const r = run('schema');
    const data = json(r.stdout) as { usage: Record<string, string> };
    expect(data.usage.set).toContain('cs config set');
    expect(data.usage.set_dry_run).toContain('--dry-run');
  });
});

// ---------------------------------------------------------------------------
// config get
// ---------------------------------------------------------------------------

describe('config get', () => {
  test('returns full config when no path given', () => {
    const r = run('get');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('default_program');
    expect(data).toHaveProperty('auto_yes');
  });

  test('returns specific field with type info', () => {
    const r = run('get', 'auto_yes');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { path: string; value: unknown; type: string };
    expect(data.path).toBe('auto_yes');
    expect(data.value).toBe(false);
    expect(data.type).toBe('boolean');
  });

  test('returns null + note for unset paths', () => {
    const r = run('get', 'profiles');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { value: unknown; note?: string };
    expect(data.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// config set
// ---------------------------------------------------------------------------

describe('config set', () => {
  test('dry-run shows diff without writing', () => {
    const r = run('set', 'auto_yes', 'true', '--dry-run');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { old_value: unknown; new_value: unknown; applied: boolean };
    expect(data.old_value).toBe(false);
    expect(data.new_value).toBe(true);
    expect(data.applied).toBe(false);

    const verify = run('get', 'auto_yes');
    const v = json(verify.stdout) as { value: unknown };
    expect(v.value).toBe(false);
  });

  test('set persists the value', () => {
    const r = run('set', 'branch_prefix', 'test/');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { applied: boolean };
    expect(data.applied).toBe(true);

    const verify = run('get', 'branch_prefix');
    const v = json(verify.stdout) as { value: unknown };
    expect(v.value).toBe('test/');
  });

  test('validates enum values', () => {
    const r = run('set', 'language', 'invalid');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Must be one of');
  });

  test('validates boolean values', () => {
    const r = run('set', 'auto_yes', 'maybe');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Expected: true | false');
  });

  test('validates number values', () => {
    const r = run('set', 'daemon_poll_interval', 'notanumber');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Invalid number');
  });

  test('sets nested dot-path', () => {
    const r = run('set', 'llm.enabled', 'true');
    expect(r.exitCode).toBe(0);

    const verify = run('get', 'llm.enabled');
    const v = json(verify.stdout) as { value: unknown };
    expect(v.value).toBe(true);
  });

  test('sets JSON array value', () => {
    const r = run('set', 'hooks.commit_message.command', '["commitmsg","--lang","en"]');
    expect(r.exitCode).toBe(0);

    const verify = run('get', 'hooks.commit_message.command');
    const v = json(verify.stdout) as { value: unknown };
    expect(v.value).toEqual(['commitmsg', '--lang', 'en']);
  });

  test('warns on unknown paths but still sets', () => {
    const r = run('set', 'unknown.key', 'hello', '--dry-run');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { warning?: string };
    expect(data.warning).toContain('not in the known schema');
  });
});

// ---------------------------------------------------------------------------
// config reset
// ---------------------------------------------------------------------------

describe('config reset', () => {
  test('resets a field to default', () => {
    run('set', 'branch_prefix', 'custom/');
    const verify1 = run('get', 'branch_prefix');
    expect((json(verify1.stdout) as { value: string }).value).toBe('custom/');

    const r = run('reset', 'branch_prefix');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { old_value: string; new_value: string; applied: boolean };
    expect(data.old_value).toBe('custom/');
    expect(data.applied).toBe(true);
  });

  test('reset --dry-run previews without writing', () => {
    run('set', 'auto_yes', 'true');
    const r = run('reset', 'auto_yes', '--dry-run');
    expect(r.exitCode).toBe(0);
    const data = json(r.stdout) as { applied: boolean };
    expect(data.applied).toBe(false);

    const verify = run('get', 'auto_yes');
    expect((json(verify.stdout) as { value: boolean }).value).toBe(true);
  });

  test('reset --all resets entire config', () => {
    run('set', 'auto_yes', 'true');
    run('set', 'branch_prefix', 'custom/');

    const r = run('reset', '--all');
    expect(r.exitCode).toBe(0);

    const verify = run('get', 'auto_yes');
    expect((json(verify.stdout) as { value: boolean }).value).toBe(false);
  });

  test('rejects unknown paths', () => {
    const r = run('reset', 'nonexistent');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Unknown config path');
  });

  test('requires --all when no path given', () => {
    const r = run('reset');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--all');
  });
});
