import { RGBA } from '@opentui/core';

/**
 * `RGBA.fromIndex(N)` tags the colour as "indexed", which makes OpenTUI
 * emit `\x1b[38;5;Nm` instead of a truecolor escape. The terminal then
 * paints it with its own 16/256-colour palette — Dracula's red, Solarized
 * yellow, your Ghostty/iTerm theme — so the UI blends with whatever the
 * user has configured rather than shouting a fixed hex.
 *
 * Indices 0–7 are the basic ANSI colours, 8–15 the bright variants.
 *  0 black  1 red  2 green  3 yellow  4 blue  5 magenta  6 cyan  7 white
 *  8 brblack  9 brred  10 brgreen  11 bryellow  12 brblue  13 brmagenta
 *  14 brcyan  15 brwhite
 */
function ansi(n: number): RGBA {
  return RGBA.fromIndex(n);
}

/**
 * Palette. Semantic colours (success/danger/warning/muted/status/diff/...)
 * go through `ansi()` so the terminal's theme wins — Solarized red, Dracula
 * green, whatever you have configured. The only hex literals here are
 * intentional brand surfaces:
 *
 *  - `primary` / `borderActive`: brand purple (kept as the one fixed accent
 *    that says "this is claude-squad", not "this is your terminal").
 *  - `selectedBg` / `selectedFg`: a fixed light-on-dark block for the
 *    selected row — needs guaranteed contrast against any background, so
 *    we can't delegate to whatever the terminal happens to call "white".
 *  - `overlayBg`: opaque slate fill for floating modals — same reason,
 *    has to mask the panel area regardless of theme.
 */
export const colors = {
  primary: '#6755B5',
  borderActive: '#6755B5',
  // Match the muted grey of brackets/timestamps in most themes — uses the
  // theme's bright-black so it never disappears against either a light
  // or dark background.
  accent: ansi(11),
  success: ansi(2),
  danger: ansi(1),
  warning: ansi(3),
  muted: ansi(8),
  border: ansi(8),

  statusRunning: ansi(2),
  statusReady: ansi(4),
  statusLoading: ansi(3),
  statusPaused: ansi(8),
  statusError: ansi(1),

  diffAdded: ansi(2),
  diffRemoved: ansi(1),
  // `↓N` (commits the host moved ahead of us). Standard ansi yellow
  // washes out against the pale-lavender selectedBg; a dark amber stays
  // readable on both the selected and unselected rows while preserving
  // the "warning, look here" hue. Doesn't repurpose `warning` (which is
  // also the loading status / prompt cue) so this swap is local to the
  // list's commit-behind glyph.
  commitBehind: '#FFBE00',

  // Selected-row block. Pale lavender — same hue family as `primary` but
  // light enough for dark text to sit on it cleanly. Slightly deeper than
  // the Go reference's #d8ddf8 so saturated yellow / amber glyphs
  // (`↓N`, loading icon) keep enough contrast on top.
  selectedBg: '#9c97cb',
  selectedFg: '#1a1a1a',
  // Solid fill for modal overlay bodies — opaque so the panel masks
  // whatever sits underneath it, while the surrounding screen stays
  // visible (no full-screen backdrop). Catppuccin-Mocha-ish dark slate:
  // clearly "floating panel" against a #000 terminal bg without the
  // pure-black look of an off-screen well.
  overlayBg: '#1e1e2e',
  // Branch line in the selected row. Darker plum-grey: still legible on
  // the pale-lavender selectedBg, but quieter than the near-black title
  // so the row still has visual hierarchy.
  selectedBranch: '#4a4470',
  // bright-white from the theme palette; bold + this index makes the
  // active tab clearly distinct from the muted inactive one without
  // forcing a hardcoded #FFF.
  tabActive: ansi(15),
  tabInactive: ansi(8),
} as const;

export const icons = {
  running: '●',
  ready: '○',
  loading: '◐',
  paused: '⏸',
  error: '✗',
  selected: '▶',
} as const;
