import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { DEFAULT_DAEMON_POLL_MS } from './constants.js';
import { configPath, ensureAppDir } from './paths.js';
import type { AppConfig, Profile } from './types.js';

export async function loadConfig(): Promise<AppConfig> {
  await ensureAppDir();
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { ...defaultConfig(), ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const cfg = defaultConfig();
      await saveConfig(cfg);
      return cfg;
    }
    throw err;
  }
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await ensureAppDir();
  await writeFile(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

export function defaultConfig(): AppConfig {
  return {
    default_program: resolveClaudeCommand(),
    auto_yes: false,
    daemon_poll_interval: DEFAULT_DAEMON_POLL_MS,
    branch_prefix: defaultBranchPrefix(),
    llm: {
      enabled: false,
      api_key: '',
      model: '',
      base_url: '',
      timeout: 30,
      stream: false,
      enable_thinking: false,
    },
  };
}

function defaultBranchPrefix(): string {
  const username = userInfo()
    .username.toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return username ? `${username}/` : '';
}

export function resolveClaudeCommand(): string {
  // Try resolving via shell so aliases work, then `which`, then fallback.
  const candidates = ['claude', 'claude-code'];
  for (const cmd of candidates) {
    const res = spawnSync('sh', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) {
      return cmd; // we shell out at run time, so the bare name is fine
    }
  }
  return 'claude';
}

/** Effective program string (resolves profile name -> program). */
export function effectiveProgram(cfg: AppConfig): string {
  const profile = cfg.profiles?.find((p) => p.name === cfg.default_program);
  return profile ? profile.program : cfg.default_program;
}

/** Synthesise a profile list when none configured. */
export function getProfiles(cfg: AppConfig): Profile[] {
  if (!cfg.profiles || cfg.profiles.length === 0) {
    return [{ name: cfg.default_program, program: cfg.default_program }];
  }
  const first = cfg.profiles.find((p) => p.name === cfg.default_program);
  const rest = cfg.profiles.filter((p) => p.name !== cfg.default_program);
  return first ? [first, ...rest] : cfg.profiles;
}
