import { cellWidth, graphemes } from './width.js';

/**
 * A grapheme-indexed text buffer. The cursor is positioned *between* graphemes,
 * with `cursor = 0` meaning before the first grapheme and `cursor = len` meaning
 * after the last grapheme.
 */
export interface TextBuffer {
  text: string;
  graphemes: string[];
  cursor: number;
  /** Length in graphemes (not chars). */
  length: number;
}

export function emptyBuffer(): TextBuffer {
  return { text: '', graphemes: [], cursor: 0, length: 0 };
}

export function fromText(text: string, cursor?: number): TextBuffer {
  const g = graphemes(text);
  return {
    text,
    graphemes: g,
    cursor: cursor ?? g.length,
    length: g.length,
  };
}

function rebuild(g: string[], cursor: number): TextBuffer {
  return { text: g.join(''), graphemes: g, cursor, length: g.length };
}

export function insertText(buf: TextBuffer, text: string): TextBuffer {
  if (!text) return buf;
  const incoming = graphemes(text);
  const next = [
    ...buf.graphemes.slice(0, buf.cursor),
    ...incoming,
    ...buf.graphemes.slice(buf.cursor),
  ];
  return rebuild(next, buf.cursor + incoming.length);
}

export function backspace(buf: TextBuffer): TextBuffer {
  if (buf.cursor === 0) return buf;
  const next = [...buf.graphemes.slice(0, buf.cursor - 1), ...buf.graphemes.slice(buf.cursor)];
  return rebuild(next, buf.cursor - 1);
}

export function deleteForward(buf: TextBuffer): TextBuffer {
  if (buf.cursor >= buf.length) return buf;
  const next = [...buf.graphemes.slice(0, buf.cursor), ...buf.graphemes.slice(buf.cursor + 1)];
  return rebuild(next, buf.cursor);
}

export function moveLeft(buf: TextBuffer): TextBuffer {
  return buf.cursor === 0 ? buf : { ...buf, cursor: buf.cursor - 1 };
}

export function moveRight(buf: TextBuffer): TextBuffer {
  return buf.cursor >= buf.length ? buf : { ...buf, cursor: buf.cursor + 1 };
}

export function moveStartOfLine(buf: TextBuffer): TextBuffer {
  // Look back for the previous newline.
  let i = buf.cursor;
  while (i > 0 && buf.graphemes[i - 1] !== '\n') i--;
  return { ...buf, cursor: i };
}

export function moveEndOfLine(buf: TextBuffer): TextBuffer {
  let i = buf.cursor;
  while (i < buf.length && buf.graphemes[i] !== '\n') i++;
  return { ...buf, cursor: i };
}

export function moveHome(buf: TextBuffer): TextBuffer {
  return { ...buf, cursor: 0 };
}

export function moveEnd(buf: TextBuffer): TextBuffer {
  return { ...buf, cursor: buf.length };
}

/** Cursor visual position assuming width-aware wrap at `width` cells. */
export interface VisualPosition {
  row: number;
  col: number;
  rows: string[];
}

export function layoutWithCursor(buf: TextBuffer, width: number): VisualPosition {
  if (width <= 0) {
    return { row: 0, col: 0, rows: [buf.text] };
  }
  const rows: string[] = [];
  let line = '';
  let lineWidth = 0;
  let cursorRow = 0;
  let cursorCol = 0;

  for (let i = 0; i < buf.length; i++) {
    if (i === buf.cursor) {
      cursorRow = rows.length;
      cursorCol = lineWidth;
    }
    const g = buf.graphemes[i]!;
    if (g === '\n') {
      rows.push(line);
      line = '';
      lineWidth = 0;
      continue;
    }
    const gw = cellWidth(g);
    if (gw === 0) {
      // Zero-width graphemes attach to the previous cell; just append without advancing.
      line += g;
      continue;
    }
    if (lineWidth + gw > width) {
      rows.push(line);
      line = g;
      lineWidth = gw;
    } else {
      line += g;
      lineWidth += gw;
    }
  }
  if (buf.cursor === buf.length) {
    cursorRow = rows.length;
    cursorCol = lineWidth;
  }
  rows.push(line);
  return { row: cursorRow, col: cursorCol, rows };
}
