import { createHash } from 'node:crypto';

/**
 * Tracks the last-seen pane snapshot hash and exposes simple prompt detection
 * for known interactive agents (claude / aider / gemini).
 */
export class StatusMonitor {
  private lastHash = '';

  /** Returns whether the snapshot changed since the previous call and whether a prompt is visible. */
  observe(content: string): { changed: boolean; hasPrompt: boolean } {
    const hash = createHash('sha1').update(content).digest('hex');
    const changed = hash !== this.lastHash;
    this.lastHash = hash;
    return { changed, hasPrompt: detectPrompt(content) };
  }

  reset(): void {
    this.lastHash = '';
  }
}

const PROMPT_PATTERNS: RegExp[] = [
  // Claude
  /No, and tell Claude what/i,
  // Aider
  /\(Y\)es\/\(N\)o\/\(D\)on['']t ask again/i,
  // Gemini
  /Yes, allow once/i,
];

const TRUST_PROMPT_PATTERNS: { pattern: RegExp; reply: 'enter' | 'd-enter' }[] = [
  { pattern: /Do you trust the files in this folder\?/i, reply: 'enter' },
  { pattern: /new MCP server/i, reply: 'enter' },
  { pattern: /Open documentation url for more info/i, reply: 'enter' },
];

export function detectPrompt(content: string): boolean {
  return PROMPT_PATTERNS.some((p) => p.test(content));
}

export function detectTrustPrompt(content: string): 'enter' | 'd-enter' | null {
  for (const { pattern, reply } of TRUST_PROMPT_PATTERNS) {
    if (pattern.test(content)) return reply;
  }
  return null;
}
