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
// Base metadata tick. Selected instance refreshes every tick; non-selected
// and paused instances are throttled (see TICK_DIVISOR_* below) since their
// numbers move much slower from the user's perspective. Tuning this trades
// responsiveness for git subprocess load (~4 git spawns per refreshed
// instance per tick).
export const METADATA_TICK_MS = 1000;
// How many ticks between refreshes for non-selected active instances.
// 10 × 1s = ~10s lag for ↑/↓ + status on background rows.
export const METADATA_TICK_DIVISOR_NON_SELECTED = 10;
// Paused instances only refresh commitStats (worktree dir is gone, so
// diff/gitStatus would fail). 30 × 1s = ~30s lag — fine because the only
// thing that changes for a paused row is the user merging from outside.
export const METADATA_TICK_DIVISOR_PAUSED = 30;
export const BRANCH_SEARCH_DEBOUNCE_MS = 150;
export const ERROR_DISMISS_MS = 3000;
export const MENU_KEY_HIGHLIGHT_MS = 500;
export const DEFAULT_DAEMON_POLL_MS = 1000;
export const AUTO_PULL_COOLDOWN_MS = 60_000;
export const TMUX_RESIZE_DEBOUNCE_MS = 50;

// Tmux session naming
export const TMUX_PREFIX = 'claudesquad_';

// Help screen bitmask bits
export const HELP_BIT_GENERAL = 1 << 0;
export const HELP_BIT_INSTANCE_START = 1 << 1;
export const HELP_BIT_INSTANCE_ATTACH = 1 << 2;
export const HELP_BIT_INSTANCE_CHECKOUT = 1 << 3;
