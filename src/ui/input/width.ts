import stringWidthLib from 'string-width';

type StringWidthFn = (s: string) => number;

declare global {
  // eslint-disable-next-line no-var
  var Bun:
    | {
        stringWidth?: (s: string) => number;
      }
    | undefined;
}

/**
 * Cell-width of a string. Prefers Bun.stringWidth (faster + CJK aware),
 * falls back to the `string-width` npm package.
 */
export const cellWidth: StringWidthFn = (s: string): number => {
  if (!s) return 0;
  const bunWidth = typeof globalThis.Bun !== 'undefined' ? globalThis.Bun.stringWidth : undefined;
  return bunWidth ? bunWidth(s) : stringWidthLib(s);
};

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Split a string into Unicode graphemes. Handles CJK + emoji ZWJ sequences. */
export function graphemes(s: string): string[] {
  const out: string[] = [];
  for (const seg of segmenter.segment(s)) out.push(seg.segment);
  return out;
}

/** Join graphemes back into a string. */
export function joinGraphemes(parts: readonly string[]): string {
  return parts.join('');
}
