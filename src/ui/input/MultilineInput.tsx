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
  /**
   * Absolute screen coordinates (in cells) of the top-left of the input's
   * **content area** (after any border + padding). When provided, the
   * terminal cursor will be parked at `(anchor.x + col, anchor.y + row)`
   * so the macOS IME candidate box anchors on the actual input glyphs.
   *
   * Required for IME to work correctly when the input is nested inside
   * any layout containers — useCursor's coordinates are relative to Ink's
   * output origin (screen top-left), not the component's local box.
   */
  cursorAnchor?: { x: number; y: number };
  /** Optional inline prefix shown to the left of the text (e.g. "> "). */
  prefix?: string;
}

/**
 * Multi-line input with IME-correct cursor placement.
 *
 * Key tricks:
 * - Uses Ink 7's `useCursor` to park the *real* terminal cursor at the
 *   visual cursor coordinate, so the macOS IME candidate box anchors on
 *   the input. Caller must pass `cursorAnchor` with the absolute screen
 *   coordinates of the content origin — see prop docs.
 * - Uses `usePaste` for bracketed paste so multi-char IME commits and
 *   pastes arrive atomically.
 * - Cursor & wrap math uses graphemes (Intl.Segmenter) and cell-widths
 *   (Bun.stringWidth / string-width), not `s.length`.
 * - Submit path uses `setTimeout(setTimeout)` to give the IME one extra
 *   event-loop turn to flush the trailing committed character.
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
    bordered = false,
    focus = true,
    cursorAnchor,
    prefix = '',
  } = props;

  const { stdout } = useStdout();
  const prefixWidth = cellWidth(prefix);
  const fallbackWidth = Math.max(1, (stdout?.columns ?? 80) - (bordered ? 4 : 2));
  // Width available for typed text (excluding the prefix).
  const width = Math.max(1, (props.width ?? fallbackWidth) - prefixWidth);

  const controlled = value !== undefined;
  const [internal, setInternal] = useState<TextBuffer>(() =>
    controlled ? fromText(value ?? '') : initialValue ? fromText(initialValue) : emptyBuffer(),
  );

  // Sync controlled value -> internal buffer.
  useEffect(() => {
    if (!controlled) return;
    if ((value ?? '') !== internal.text) {
      setInternal(fromText(value ?? '', internal.cursor));
    }
  }, [value, controlled, internal.text, internal.cursor]);

  const update = useCallback(
    (next: TextBuffer): void => {
      setInternal(next);
      if (!controlled) onChange?.(next.text);
      else if (next.text !== (value ?? '')) onChange?.(next.text);
    },
    [controlled, onChange, value],
  );

  const layout = useMemo(() => layoutWithCursor(internal, width), [internal, width]);

  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    if (layout.row < scrollTop) setScrollTop(layout.row);
    else if (layout.row >= scrollTop + rows) setScrollTop(layout.row - rows + 1);
  }, [layout.row, rows, scrollTop]);

  const visibleRows = layout.rows.slice(scrollTop, scrollTop + rows);

  // === IME cursor anchor ===
  const { setCursorPosition } = useCursor();
  useEffect(() => {
    if (!focus) {
      setCursorPosition(undefined);
      return;
    }
    // Absolute screen position = anchor (content origin) + local cursor +
    // prefix width (prefix is rendered only on row 0).
    const localX = layout.col + (layout.row === 0 ? prefixWidth : 0);
    const localY = layout.row - scrollTop;
    if (cursorAnchor) {
      setCursorPosition({
        x: cursorAnchor.x + localX,
        y: cursorAnchor.y + localY,
      });
    } else {
      // Best-effort fallback: caller didn't pass an anchor, so the IME box
      // will sit at the top-left of Ink's output region. Still set the
      // position so the cursor stays in the input region.
      setCursorPosition({ x: localX, y: localY });
    }
    return () => setCursorPosition(undefined);
  }, [
    focus,
    layout.col,
    layout.row,
    scrollTop,
    cursorAnchor?.x,
    cursorAnchor?.y,
    prefixWidth,
    setCursorPosition,
  ]);

  // === Paste ===
  usePaste(
    (text) => {
      if (!focus) return;
      const normalised = text.replace(/\r\n?/g, '\n');
      update(insertText(internal, normalised));
    },
    { isActive: focus },
  );

  const pendingSubmit = useRef(false);
  const submit = useCallback(() => {
    if (pendingSubmit.current) return;
    pendingSubmit.current = true;
    // Two nested setTimeouts give the IME one extra event-loop turn to flush
    // any trailing committed character (e.g. last Pinyin char after Space).
    setTimeout(() => {
      setTimeout(() => {
        const text = internal.text;
        pendingSubmit.current = false;
        onSubmit?.(text);
        // Reset buffer after submit so the next session starts empty.
        setInternal(emptyBuffer());
      }, 0);
    }, 0);
  }, [internal.text, onSubmit]);

  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.return) {
        if (submitOnEnter && !key.shift) submit();
        else update(insertText(internal, '\n'));
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
      if (input) {
        const normalised = input.replace(/\r\n?/g, '\n');
        update(insertText(internal, normalised));
      }
    },
    { isActive: focus },
  );

  const showPlaceholder = internal.length === 0 && placeholder;

  const content = (
    <Box flexDirection="column" width={width + prefixWidth} height={rows}>
      {showPlaceholder ? (
        <>
          <Box>
            {prefix && <Text color="cyan">{prefix}</Text>}
            <Text color="gray">{placeholder}</Text>
          </Box>
          {Array.from({ length: rows - 1 }, (_, i) => (
            <Text key={`pad-${i}`}> </Text>
          ))}
        </>
      ) : (
        Array.from({ length: rows }, (_, i) => {
          const row = visibleRows[i] ?? '';
          const isFirstVisible = i === 0;
          return (
            <Box key={i}>
              {prefix && (
                <Text color="cyan">{isFirstVisible ? prefix : ' '.repeat(prefixWidth)}</Text>
              )}
              <Text>{row.length > 0 ? row : ' '}</Text>
            </Box>
          );
        })
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
