export const APP_NAME = 'claude-squad-ts';
export const APP_VERSION = '0.1.0';

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

// Detach key for interactive attach (Ctrl+Q, byte 0x11)
export const DETACH_KEY_BYTE = 0x11;

// Help screen bitmask bits
export const HELP_BIT_GENERAL = 1 << 0;
export const HELP_BIT_INSTANCE_START = 1 << 1;
export const HELP_BIT_INSTANCE_ATTACH = 1 << 2;
export const HELP_BIT_INSTANCE_CHECKOUT = 1 << 3;
