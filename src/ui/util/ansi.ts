import { RGBA, StyledText, TextAttributes, type TextChunk } from '@opentui/core';

/**
 * Parse a string containing ANSI escape sequences and return a StyledText
 * whose chunks carry the resolved fg/bg/attributes. Non-SGR escape sequences
 * (cursor movement, OSC hyperlinks, etc.) are dropped — they don't make
 * sense in a static preview pane.
 *
 * Supports:
 * - SGR codes 0–9 (style), 22–29 (un-style), 30–37/90–97 (fg basic / bright),
 *   40–47/100–107 (bg basic / bright)
 * - 256-colour: `38;5;N` / `48;5;N`
 * - Truecolour: `38;2;R;G;B` / `48;2;R;G;B`
 * - Reset (`0`), reset-fg (`39`), reset-bg (`49`)
 */
export function ansiToStyledText(input: string): StyledText {
  const chunks: TextChunk[] = [];
  const state: SgrState = { attributes: 0 };

  let lastIndex = 0;
  // Reset lastIndex on the shared regex each call.
  ESC_RE.lastIndex = 0;
  let match = ESC_RE.exec(input);
  while (match !== null) {
    const text = input.slice(lastIndex, match.index);
    if (text) chunks.push(makeChunk(text, state));
    if (match[1] !== undefined) {
      // SGR sequence: parse its numeric codes.
      const codes = match[1].length
        ? match[1].split(';').map((s) => Number.parseInt(s, 10) || 0)
        : [0];
      applyCodes(state, codes);
    }
    // Non-SGR escape sequences (other CSI, OSC) are dropped: no text emitted.
    lastIndex = match.index + match[0].length;
    match = ESC_RE.exec(input);
  }
  const tail = input.slice(lastIndex);
  if (tail) chunks.push(makeChunk(tail, state));

  return new StyledText(chunks);
}

// =====================================================================
// internals
// =====================================================================

interface SgrState {
  fg?: RGBA;
  bg?: RGBA;
  attributes: number;
}

// SGR (`\x1b[…m`) is captured into group 1 so the caller knows it's SGR vs.
// some other escape we should just drop. The remaining branches in the
// alternation eat the bytes of any other CSI / OSC sequence so they don't
// pollute the rendered text.
const ESC_RE =
  /\x1b\[([\d;]*)m|\x1b\[[\d;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/**
 * Indexed-color helper. Returns an RGBA with `intent: "indexed"` so
 * OpenTUI emits `\x1b[38;5;Nm` rather than a fixed-RGB truecolor escape
 * — which lets the user's terminal apply its own 256-colour palette /
 * theme (Dracula, Solarized, iTerm/Ghostty custom, ...). Without this
 * the preview would lock the colours to xterm's default palette and
 * visibly disagree with the attach view, which honours the theme.
 */
function indexed(n: number): RGBA {
  const idx = n < 0 ? 0 : n > 255 ? 255 : n;
  return RGBA.fromIndex(idx);
}

function applyCodes(state: SgrState, codes: number[]): void {
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!;
    if (c === 0) {
      state.fg = undefined;
      state.bg = undefined;
      state.attributes = TextAttributes.NONE;
      continue;
    }
    // Attribute toggles
    switch (c) {
      case 1:
        state.attributes |= TextAttributes.BOLD;
        continue;
      case 2:
        state.attributes |= TextAttributes.DIM;
        continue;
      case 3:
        state.attributes |= TextAttributes.ITALIC;
        continue;
      case 4:
        state.attributes |= TextAttributes.UNDERLINE;
        continue;
      case 5:
        state.attributes |= TextAttributes.BLINK;
        continue;
      case 7:
        state.attributes |= TextAttributes.INVERSE;
        continue;
      case 8:
        state.attributes |= TextAttributes.HIDDEN;
        continue;
      case 9:
        state.attributes |= TextAttributes.STRIKETHROUGH;
        continue;
      case 22:
        state.attributes &= ~(TextAttributes.BOLD | TextAttributes.DIM);
        continue;
      case 23:
        state.attributes &= ~TextAttributes.ITALIC;
        continue;
      case 24:
        state.attributes &= ~TextAttributes.UNDERLINE;
        continue;
      case 25:
        state.attributes &= ~TextAttributes.BLINK;
        continue;
      case 27:
        state.attributes &= ~TextAttributes.INVERSE;
        continue;
      case 28:
        state.attributes &= ~TextAttributes.HIDDEN;
        continue;
      case 29:
        state.attributes &= ~TextAttributes.STRIKETHROUGH;
        continue;
      case 39:
        state.fg = undefined;
        continue;
      case 49:
        state.bg = undefined;
        continue;
    }
    // Basic fg/bg (30–37, 40–47) and bright (90–97, 100–107).
    // Emitted as indexed colours so the terminal's own palette /
    // theme is applied (see `indexed()` above).
    if (c >= 30 && c <= 37) {
      state.fg = indexed(c - 30);
      continue;
    }
    if (c >= 40 && c <= 47) {
      state.bg = indexed(c - 40);
      continue;
    }
    if (c >= 90 && c <= 97) {
      state.fg = indexed(c - 90 + 8);
      continue;
    }
    if (c >= 100 && c <= 107) {
      state.bg = indexed(c - 100 + 8);
      continue;
    }
    // Extended colour: 38 / 48 followed by 5;N (256) or 2;R;G;B (truecolour)
    if (c === 38 || c === 48) {
      const kind = codes[i + 1];
      if (kind === 5) {
        // 256-colour: keep the index so the terminal renders via its
        // configured palette, matching what `tmux attach` shows.
        const idx = codes[i + 2] ?? 0;
        const colour = indexed(idx);
        if (c === 38) state.fg = colour;
        else state.bg = colour;
        i += 2;
      } else if (kind === 2) {
        // Truecolour: programs that emit 24-bit RGB do so deliberately,
        // so we forward the exact values.
        const r = codes[i + 2] ?? 0;
        const g = codes[i + 3] ?? 0;
        const b = codes[i + 4] ?? 0;
        const colour = RGBA.fromInts(r, g, b);
        if (c === 38) state.fg = colour;
        else state.bg = colour;
        i += 4;
      }
      // unknown sub-mode: silently skip
    }
    // Unknown codes are ignored.
  }
}

function makeChunk(text: string, state: SgrState): TextChunk {
  const chunk: TextChunk = { __isChunk: true, text };
  if (state.fg) chunk.fg = state.fg;
  if (state.bg) chunk.bg = state.bg;
  if (state.attributes) chunk.attributes = state.attributes;
  return chunk;
}
