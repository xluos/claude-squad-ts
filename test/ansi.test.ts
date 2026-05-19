import { TextAttributes } from '@opentui/core';
import { expect, test } from 'bun:test';
import { ansiToStyledText } from '../src/ui/util/ansi.js';

test('plain text becomes a single chunk with no styling', () => {
  const styled = ansiToStyledText('hello world');
  expect(styled.chunks).toHaveLength(1);
  expect(styled.chunks[0]!.text).toBe('hello world');
  expect(styled.chunks[0]!.fg).toBeUndefined();
  expect(styled.chunks[0]!.bg).toBeUndefined();
});

test('basic red fg', () => {
  const styled = ansiToStyledText('\x1b[31mERROR\x1b[0m done');
  expect(styled.chunks[0]!.text).toBe('ERROR');
  expect(styled.chunks[0]!.fg).toBeDefined();
  expect(styled.chunks[1]!.text).toBe(' done');
  expect(styled.chunks[1]!.fg).toBeUndefined();
});

test('bold + colour combine then reset attributes only', () => {
  const styled = ansiToStyledText('\x1b[1;36mhi\x1b[22m more');
  expect(styled.chunks[0]!.attributes).toBe(TextAttributes.BOLD);
  expect(styled.chunks[0]!.fg).toBeDefined();
  expect(styled.chunks[1]!.attributes).toBeFalsy();
  // fg still cyan after un-bold
  expect(styled.chunks[1]!.fg).toBeDefined();
});

test('truecolour 38;2;R;G;B parses', () => {
  const styled = ansiToStyledText('\x1b[38;2;255;0;128mP\x1b[0m');
  expect(styled.chunks[0]!.fg).toBeDefined();
});

test('256-colour 38;5;N parses', () => {
  const styled = ansiToStyledText('\x1b[38;5;174mA\x1b[0m');
  expect(styled.chunks[0]!.fg).toBeDefined();
});

test('non-SGR CSI sequences are dropped without leaking digits', () => {
  // Cursor-up (\x1b[2A) and erase-line (\x1b[K) shouldn't end up as "2A" or "K"
  const styled = ansiToStyledText('before\x1b[2A\x1b[Kafter');
  const flat = styled.chunks.map((c) => c.text).join('');
  expect(flat).toBe('beforeafter');
});

test('OSC hyperlink sequence is dropped', () => {
  const styled = ansiToStyledText('\x1b]8;;https://example.com\x07link\x1b]8;;\x07');
  const flat = styled.chunks.map((c) => c.text).join('');
  expect(flat).toBe('link');
});

test('handles CJK glyphs alongside SGR without dropping characters', () => {
  const styled = ansiToStyledText('\x1b[33m你好\x1b[0m世界');
  const flat = styled.chunks.map((c) => c.text).join('');
  expect(flat).toBe('你好世界');
});
