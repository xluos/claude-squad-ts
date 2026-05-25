/**
 * `cs config` — AI-friendly configuration management.
 *
 * Every subcommand outputs structured JSON so agents can discover, inspect,
 * and modify the config programmatically.
 */

import { defaultConfig, loadConfig, saveConfig } from '../../shared/config.js';
import { configPath } from '../../shared/paths.js';

// ---------------------------------------------------------------------------
// Schema definition
// ---------------------------------------------------------------------------

type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'json';

interface ConfigField {
  path: string;
  type: FieldType;
  description: string;
  enum?: string[];
  examples?: unknown[];
}

const COMMIT_POINTS = ['merge', 'squashApply', 'autoCommit', 'pull'] as const;

const CONFIG_SCHEMA: ConfigField[] = [
  {
    path: 'default_program',
    type: 'string',
    description: 'Default program to launch in new sessions',
    examples: ['claude', 'codex', 'aider'],
  },
  {
    path: 'auto_yes',
    type: 'boolean',
    description: 'Automatically accept agent prompts without user confirmation',
  },
  {
    path: 'daemon_poll_interval',
    type: 'number',
    description: 'Daemon polling interval in milliseconds',
  },
  {
    path: 'branch_prefix',
    type: 'string',
    description: 'Prefix for auto-generated worktree branch names',
  },
  {
    path: 'language',
    type: 'string',
    description: 'UI language. "auto" detects from $LANG/$LC_ALL',
    enum: ['en', 'zh', 'auto'],
  },
  {
    path: 'auto_pull',
    type: 'boolean',
    description:
      'Automatically pull host branch into running worktrees when behind (conflict-free only)',
  },
  {
    path: 'profiles',
    type: 'json',
    description: 'Program profiles array. Each entry: {name: string, program: string}',
    examples: [
      [
        { name: 'claude', program: 'claude' },
        { name: 'codex', program: 'codex' },
      ],
    ],
  },
  // -- LLM --
  {
    path: 'llm.enabled',
    type: 'boolean',
    description: 'Enable LLM-powered CJK branch-name translation',
  },
  {
    path: 'llm.api_key',
    type: 'string',
    description: 'API key for the LLM service',
  },
  {
    path: 'llm.model',
    type: 'string',
    description: 'LLM model name',
  },
  {
    path: 'llm.base_url',
    type: 'string',
    description: 'Base URL of an OpenAI-compatible /chat/completions endpoint',
  },
  {
    path: 'llm.timeout',
    type: 'number',
    description: 'LLM request timeout in seconds',
  },
  {
    path: 'llm.stream',
    type: 'boolean',
    description: 'Use streaming for LLM requests',
  },
  {
    path: 'llm.enable_thinking',
    type: 'boolean',
    description: 'Disable internal CoT scaffolding (for some Chinese LLM vendors)',
  },
  // -- Hooks: commit_message (general) --
  {
    path: 'hooks.commit_message.command',
    type: 'string[]',
    description:
      'Program + args for generating commit messages. Spawned with cwd = repo dir, reads git diff --cached, stdout = message',
    examples: [['commitmsg'], ['commitmsg', '--lang', 'en']],
  },
  {
    path: 'hooks.commit_message.enabled',
    type: 'boolean',
    description: 'Master switch for the commit-message hook (default: true when command is set)',
  },
  {
    path: 'hooks.commit_message.timeout',
    type: 'number',
    description: 'Seconds before the hook is killed and the operation aborts',
  },
  // -- Hooks: commit_message per-point overrides --
  ...COMMIT_POINTS.flatMap((point): ConfigField[] => [
    {
      path: `hooks.commit_message.overrides.${point}.command`,
      type: 'string[]',
      description: `Override commit-message command for the "${point}" commit point`,
      examples: [['commitmsg'], ['commitmsg', '--lang', 'en']],
    },
    {
      path: `hooks.commit_message.overrides.${point}.enabled`,
      type: 'boolean',
      description: `Enable/disable the hook specifically for the "${point}" commit point`,
    },
    {
      path: `hooks.commit_message.overrides.${point}.timeout`,
      type: 'number',
      description: `Hook timeout in seconds for the "${point}" commit point`,
    },
  ]),
];

// ---------------------------------------------------------------------------
// Dot-path helpers
// ---------------------------------------------------------------------------

function getByPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  let cur = obj;
  for (const key of keys) {
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[last] = value;
}

function deleteByPath(obj: Record<string, unknown>, path: string): boolean {
  const keys = path.split('.');
  const last = keys.pop()!;
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur != null && typeof cur === 'object' && last in (cur as Record<string, unknown>)) {
    delete (cur as Record<string, unknown>)[last];
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Type coercion + validation
// ---------------------------------------------------------------------------

function coerce(raw: string, field: ConfigField): unknown {
  switch (field.type) {
    case 'boolean': {
      if (raw === 'true' || raw === '1') return true;
      if (raw === 'false' || raw === '0') return false;
      throw new Error(`Invalid boolean value "${raw}". Expected: true | false`);
    }
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`Invalid number "${raw}"`);
      return n;
    }
    case 'string': {
      if (field.enum && !field.enum.includes(raw)) {
        throw new Error(`Invalid value "${raw}". Must be one of: ${field.enum.join(', ')}`);
      }
      return raw;
    }
    case 'string[]':
    case 'json': {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(
          `Invalid JSON: ${raw}. For string[] provide a JSON array, e.g. '["cmd","--flag"]'`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// JSON output helper
// ---------------------------------------------------------------------------

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Subcommand: schema
// ---------------------------------------------------------------------------

export async function runConfigSchema(): Promise<void> {
  const cfg = await loadConfig();
  const defaults = defaultConfig();

  emit({
    config_path: configPath(),
    usage: {
      schema: 'cs config schema',
      get_all: 'cs config get',
      get_field: 'cs config get <dot.path>',
      set: 'cs config set <dot.path> <value>',
      set_dry_run: 'cs config set <dot.path> <value> --dry-run',
      reset_field: 'cs config reset <dot.path>',
      reset_all: 'cs config reset --all',
      show_path: 'cs config path',
    },
    fields: CONFIG_SCHEMA.map((f) => ({
      path: f.path,
      type: f.type,
      description: f.description,
      default: getByPath(defaults, f.path) ?? null,
      current: getByPath(cfg, f.path) ?? null,
      ...(f.enum ? { enum: f.enum } : {}),
      ...(f.examples ? { examples: f.examples } : {}),
    })),
  });
}

// ---------------------------------------------------------------------------
// Subcommand: get
// ---------------------------------------------------------------------------

export async function runConfigGet(path?: string): Promise<void> {
  const cfg = await loadConfig();

  if (!path) {
    emit(cfg);
    return;
  }

  const field = CONFIG_SCHEMA.find((f) => f.path === path);
  const value = getByPath(cfg, path);

  emit({
    path,
    value: value ?? null,
    ...(field ? { type: field.type, description: field.description } : {}),
    ...(value === undefined
      ? { note: 'Path not set. Run "cs config schema" to see all paths.' }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// Subcommand: set
// ---------------------------------------------------------------------------

export async function runConfigSet(
  path: string,
  rawValue: string,
  opts: { dryRun?: boolean },
): Promise<void> {
  const field = CONFIG_SCHEMA.find((f) => f.path === path);
  const cfg = await loadConfig();
  const oldValue = getByPath(cfg, path);

  let newValue: unknown;
  if (field) {
    newValue = coerce(rawValue, field);
  } else {
    try {
      newValue = JSON.parse(rawValue);
    } catch {
      newValue = rawValue;
    }
  }

  const result: Record<string, unknown> = {
    path,
    old_value: oldValue ?? null,
    new_value: newValue,
    applied: !opts.dryRun,
  };
  if (!field) {
    result.warning = `"${path}" is not in the known schema. Run "cs config schema" to see valid paths.`;
  }

  if (!opts.dryRun) {
    setByPath(cfg as unknown as Record<string, unknown>, path, newValue);
    await saveConfig(cfg);
  }

  emit(result);
}

// ---------------------------------------------------------------------------
// Subcommand: reset
// ---------------------------------------------------------------------------

export async function runConfigReset(
  path: string | undefined,
  opts: { all?: boolean; dryRun?: boolean },
): Promise<void> {
  const cfg = await loadConfig();
  const defaults = defaultConfig();

  if (opts.all || !path) {
    if (!opts.all && !path) {
      throw new Error('Specify a dot-path to reset, or use --all to reset the entire config.');
    }
    const result = {
      old_config: cfg,
      new_config: defaults,
      applied: !opts.dryRun,
    };
    if (!opts.dryRun) {
      await saveConfig(defaults);
    }
    emit(result);
    return;
  }

  const field = CONFIG_SCHEMA.find((f) => f.path === path);
  if (!field) {
    throw new Error(
      `Unknown config path "${path}". Run "cs config schema" to see available paths.`,
    );
  }

  const oldValue = getByPath(cfg, path);
  const defaultValue = getByPath(defaults, path);

  if (!opts.dryRun) {
    if (defaultValue === undefined) {
      deleteByPath(cfg as unknown as Record<string, unknown>, path);
    } else {
      setByPath(cfg as unknown as Record<string, unknown>, path, defaultValue);
    }
    await saveConfig(cfg);
  }

  emit({
    path,
    old_value: oldValue ?? null,
    new_value: defaultValue ?? null,
    applied: !opts.dryRun,
  });
}

// ---------------------------------------------------------------------------
// Subcommand: path
// ---------------------------------------------------------------------------

export function runConfigPath(): void {
  emit({ config_path: configPath() });
}
