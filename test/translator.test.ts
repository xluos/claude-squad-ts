import { expect, test } from 'bun:test';
import { hasNonAscii, sanitizeIdentifier, translateToEnglishId } from '../src/session/llm/translator.js';

test('hasNonAscii detects CJK and emoji, passes ASCII', () => {
  expect(hasNonAscii('hello')).toBe(false);
  expect(hasNonAscii('hello world')).toBe(false);
  expect(hasNonAscii('测试')).toBe(true);
  expect(hasNonAscii('mix 中文 input')).toBe(true);
  expect(hasNonAscii('🚀')).toBe(true);
});

test('sanitizeIdentifier produces valid kebab-case', () => {
  expect(sanitizeIdentifier('Add User Auth')).toBe('add-user-auth');
  expect(sanitizeIdentifier('FIX!!! login bug')).toBe('fix-login-bug');
  expect(sanitizeIdentifier('  --hello-world--  ')).toBe('hello-world');
  expect(sanitizeIdentifier('   ')).toBe('');
});

test('translateToEnglishId falls back when LLM disabled or unconfigured', async () => {
  // disabled
  const a = await translateToEnglishId('测试', {
    enabled: false,
    api_key: 'k',
    model: 'm',
    base_url: 'https://example.com',
  });
  expect(a).toMatch(/^session-\d+$/);

  // missing api key
  const b = await translateToEnglishId('测试', {
    enabled: true,
    model: 'm',
    base_url: 'https://example.com',
  });
  expect(b).toMatch(/^session-\d+$/);

  // missing config entirely
  const c = await translateToEnglishId('测试', undefined);
  expect(c).toMatch(/^session-\d+$/);
});
