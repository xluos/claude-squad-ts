import { Box, Text, useCursor, useInput, usePaste, useStdout } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  backspace,
  deleteForward,
  emptyBuffer,
  fromText,
  insertText,
  layoutWithCursor,
  moveEnd,
  moveEndOfLine,
  moveHome,
  moveLeft,
  moveRight,
  moveStartOfLine,
  type TextBuffer,
} from './buffer.js';
import { cellWidth } from './width.js';

export interface MultilineInputProps {
  value?: string;
  initialValue?: string;
  onChange?: (text: string) => void;
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  /**
   * Fixed visible width in cells (excluding any framing). If omitted, falls
   * back to stdout columns - 2.
   */
  width?: number;
  /** Max visible rows; the buffer scrolls vertically beyond this. */
  rows?: number;
  /** Submit with Enter? When false, Enter inserts a newline (Shift+Enter still inserts). */
  submitOnEnter?: boolean;
  /** Show a thin border for affordance. */
  bordered?: boolean;
  /** Focus the input (defaults to true). */
  focus?: boolean;
}

/**
 * Multi-line input with IME-correct cursor placement.
 *
 * Key tricks:
 * - Uses Ink 7's `useCursor` to park the *real* terminal cursor at the visual
 *   cursor coordinate after every frame, so the macOS IME candidate box
 *   anchors on the input.
 * - Uses `usePaste` for bracketed paste so multi-char IME commits and pastes
 *   are atomic rather than per-keystroke.
 * - Cursor & wrap math uses graphemes (Intl.Segmenter) and cell-widths
 *   (Bun.stringWidth / string-width), not `s.length`.
 * - Submit path uses `setTimeout(setTimeout)` to give the IME one extra
 *   event-loop turn to flush the trailing committed character (opencode hack).
 */
export function MultilineInput(props: MultilineInputProps): React.ReactElement {
  const {
    value,
    initialValue,
    onChange,
    onSubmit,
    onCancel,
    placeholder,
    rows = 6,
    submitOnEnter = true,
    bordered = true,
    focus = true,
  } = props;

  const { stdout } = useStdout();
  const fallbackWidth = Math.max(1, (stdout?.columns ?? 80) - (bordered ? 4 : 2));
  const width = Math.max(1, props.width ?? fallbackWidth);

  const controlled = value !== undefined;
  const [internal, setInternal] = useState<TextBuffer>(() =>
    controlled ? fromText(value ?? '') : initialValue ? fromText(initialValue) : emptyBuffer(),
  );

  // Sync controlled value -> internal buffer (only when it really changed).
  useEffect(() => {
    if (!controlled) return;
    if ((value ?? '') !== internal.text) {
      setInternal(fromText(value ?? '', internal.cursor));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, controlled]);

  const update = useCallback(
    (next: TextBuffer): void => {
      setInternal(next);
      if (!controlled) onChange?.(next.text);
      else if (next.text !== (value ?? '')) onChange?.(next.text);
    },
    [controlled, onChange, value],
  );

  // Layout for rendering + cursor placement.
  const layout = useMemo(() => layoutWithCursor(internal, width), [internal, width]);

  // Vertical scroll window.
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    if (layout.row < scrollTop) setScrollTop(layout.row);
    else if (layout.row >= scrollTop + rows) setScrollTop(layout.row - rows + 1);
  }, [layout.row, rows, scrollTop]);

  const visibleRows = layout.rows.slice(scrollTop, scrollTop + rows);
  const padOffsetX = bordered ? 1 : 0;
  const padOffsetY = bordered ? 1 : 0;

  // === IME cursor anchor ===
  const { setCursorPosition } = useCursor();
  useEffect(() => {
    if (!focus) {
      setCursorPosition(undefined);
      return;
    }
    setCursorPosition({
      x: padOffsetX + layout.col,
      y: padOffsetY + (layout.row - scrollTop),
    });
    return () => setCursorPosition(undefined);
  }, [focus, layout.col, layout.row, scrollTop, padOffsetX, padOffsetY, setCursorPosition]);

  // === Paste ===
  usePaste(
    (text) => {
      if (!focus) return;
      // Normalise Windows CR-only sequences (ConPTY ships \r without \n).
      const normalised = text.replace(/\r\n?/g, '\n');
      update(insertText(internal, normalised));
    },
    { isActive: focus },
  );

  // === Submission with IME-flush deferral (opencode pattern) ===
  const pendingSubmit = useRef(false);
  const submit = useCallback(() => {
    if (pendingSubmit.current) return;
    pendingSubmit.current = true;
    // Two nested setTimeouts give the IME one extra event-loop turn to flush
    // any trailing committed character (e.g. last Pinyin character after Space).
    setTimeout(() => {
      setTimeout(() => {
        const text = internal.text;
        pendingSubmit.current = false;
        onSubmit?.(text);
      }, 0);
    }, 0);
  }, [internal.text, onSubmit]);

  // === Keystroke handling ===
  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.return) {
        if (submitOnEnter && !key.shift) {
          submit();
        } else {
          update(insertText(internal, '\n'));
        }
        return;
      }
      if (key.backspace || (key.ctrl && input === 'h')) {
        update(backspace(internal));
        return;
      }
      if (key.delete) {
        update(deleteForward(internal));
        return;
      }
      if (key.leftArrow) {
        update(moveLeft(internal));
        return;
      }
      if (key.rightArrow) {
        update(moveRight(internal));
        return;
      }
      if (key.upArrow) {
        const targetRow = Math.max(0, layout.row - 1);
        update(moveToVisual(internal, targetRow, layout.col, width));
        return;
      }
      if (key.downArrow) {
        const targetRow = Math.min(layout.rows.length - 1, layout.row + 1);
        update(moveToVisual(internal, targetRow, layout.col, width));
        return;
      }
      if (key.home) {
        update(moveStartOfLine(internal));
        return;
      }
      if (key.end) {
        update(moveEndOfLine(internal));
        return;
      }
      if (key.ctrl && input === 'a') {
        update(moveHome(internal));
        return;
      }
      if (key.ctrl && input === 'e') {
        update(moveEnd(internal));
        return;
      }
      if (key.ctrl || key.meta) return;
      // Plain text (including IME-committed multi-char strings):
      if (input) {
        const normalised = input.replace(/\r\n?/g, '\n');
        update(insertText(internal, normalised));
      }
    },
    { isActive: focus },
  );

  const showPlaceholder = internal.length === 0 && placeholder;

  // Always render exactly `rows` lines so the box keeps a stable height
  // regardless of how much text is typed. Cells beyond the current line
  // are filled with a single space so Ink doesn't collapse the <Text>.
  const lines: string[] = Array.from({ length: rows }, (_, i) => {
    if (showPlaceholder && i === 0) return '';
    const row = visibleRows[i] ?? '';
    return row.length > 0 ? row : ' ';
  });

  const content = (
    <Box flexDirection="column" width={width} height={rows}>
      {showPlaceholder ? (
        <>
          <Text color="gray">{placeholder}</Text>
          {Array.from({ length: rows - 1 }, (_, i) => (
            <Text key={`pad-${i}`}> </Text>
          ))}
        </>
      ) : (
        lines.map((line, i) => <Text key={i}>{line}</Text>)
      )}
    </Box>
  );

  return bordered ? (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
      {content}
    </Box>
  ) : (
    content
  );
}

/** Compute a new buffer cursor that lands on (targetRow, targetCol) in visual space. */
function moveToVisual(
  buf: TextBuffer,
  targetRow: number,
  targetCol: number,
  width: number,
): TextBuffer {
  let row = 0;
  let col = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (row === targetRow && col >= targetCol) return { ...buf, cursor: i };
    if (i === buf.length) break;
    const g = buf.graphemes[i]!;
    if (g === '\n') {
      if (row === targetRow) return { ...buf, cursor: i };
      row++;
      col = 0;
      continue;
    }
    const gw = cellWidth(g);
    if (col + gw > width) {
      if (row === targetRow) return { ...buf, cursor: i };
      row++;
      col = gw;
    } else {
      col += gw;
    }
  }
  return { ...buf, cursor: buf.length };
}
