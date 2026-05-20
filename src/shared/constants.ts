// Single source of truth for name + version is package.json. Bun's
// bundler inlines this JSON import at build time, so the produced
// `dist/index.js` doesn't need to read it at runtime — and `bun run dev`
// reads it directly via the bundler-style resolver. Keeps `cs --version`
// honest after a `pnpm version` bump without touching code.
import pkg from '../../package.json';

export const APP_NAME = pkg.name;
export const APP_VERSION = pkg.version;

// Limits mirroring the Go version
export const MAX_INSTANCES = 10;
export const MAX_BRANCH_RESULTS = 50;
export const TMUX_HISTORY_LIMIT = 10_000;

// Timing
export const PREVIEW_TICK_MS = 100;
export const METADATA_TICK_MS = 500;
export const BRANCH_SEARCH_DEBOUNCE_MS = 150;
export const ERROR_DISMISS_MS = 3000;
export const MENU_KEY_HIGHLIGHT_MS = 500;
export const DEFAULT_DAEMON_POLL_MS = 1000;
export const TMUX_RESIZE_DEBOUNCE_MS = 50;

// Tmux session naming
export const TMUX_PREFIX = 'claudesquad_';

// Help screen bitmask bits
export const HELP_BIT_GENERAL = 1 << 0;
export const HELP_BIT_INSTANCE_START = 1 << 1;
export const HELP_BIT_INSTANCE_ATTACH = 1 << 2;
export const HELP_BIT_INSTANCE_CHECKOUT = 1 << 3;
