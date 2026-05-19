import { expect, test } from 'bun:test';
import {
  backspace,
  emptyBuffer,
  fromText,
  insertText,
  layoutWithCursor,
  moveLeft,
  moveRight,
} from '../src/ui/input/buffer.js';
import { cellWidth, graphemes } from '../src/ui/input/width.js';

test('cellWidth: ASCII vs CJK vs emoji', () => {
  expect(cellWidth('a')).toBe(1);
  expect(cellWidth('中')).toBe(2);
  expect(cellWidth('国')).toBe(2);
  // family ZWJ emoji is typically width 2
  expect(cellWidth('👨')).toBeGreaterThanOrEqual(2);
});

test('graphemes: splits ZWJ emoji and CJK correctly', () => {
  expect(graphemes('a你b好')).toEqual(['a', '你', 'b', '好']);
});

test('insertText keeps cursor after inserted graphemes', () => {
  const b = insertText(emptyBuffer(), 'abc');
  expect(b.text).toBe('abc');
  expect(b.cursor).toBe(3);
  const b2 = insertText(b, '你好');
  expect(b2.text).toBe('abc你好');
  expect(b2.cursor).toBe(5); // 5 graphemes
});

test('backspace deletes one grapheme even for wide chars', () => {
  const b = fromText('a你');
  expect(b.length).toBe(2);
  const b2 = backspace(b);
  expect(b2.text).toBe('a');
  expect(b2.cursor).toBe(1);
});

test('moveLeft / moveRight clamp at bounds', () => {
  const b = fromText('ab');
  expect(moveLeft(moveLeft(moveLeft(b))).cursor).toBe(0);
  expect(moveRight(moveRight(moveRight(b))).cursor).toBe(2);
});

test('layoutWithCursor: wraps by cell width, CJK chars take 2', () => {
  // width = 4 cells, "你好世界" = 8 cells -> 2 rows of 2 chars each
  const b = fromText('你好世界');
  const layout = layoutWithCursor(b, 4);
  expect(layout.rows).toEqual(['你好', '世界']);
  // cursor at end -> row 1, col 4
  expect(layout.row).toBe(1);
  expect(layout.col).toBe(4);
});

test('layoutWithCursor: cursor mid-string places correctly', () => {
  const b = fromText('a你b');
  b.cursor = 2; // after '你'
  const layout = layoutWithCursor(b, 80);
  expect(layout.row).toBe(0);
  expect(layout.col).toBe(3); // a=1, 你=2 -> col 3
});

test('layoutWithCursor: newlines split rows', () => {
  const b = fromText('hi\nthere');
  const layout = layoutWithCursor(b, 80);
  expect(layout.rows).toEqual(['hi', 'there']);
});
