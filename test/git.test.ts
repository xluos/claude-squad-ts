import { expect, test } from 'bun:test';
import { sanitizeBranchName } from '../src/session/git/util.js';

test('sanitizeBranchName lowercases, replaces spaces, strips junk', () => {
  expect(sanitizeBranchName('My New Feature')).toBe('my-new-feature');
  // CJK chars + non-word punctuation are stripped, spaces become dashes, dashes are coalesced.
  expect(sanitizeBranchName('feat: 中文 / fix!')).toBe('feat-/-fix');
  expect(sanitizeBranchName('  --hello-- ')).toBe('hello');
});
