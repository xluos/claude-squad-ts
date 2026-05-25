import { log } from '../../shared/logger.js';
import type { LLMConfig } from '../../shared/types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

const PROMPT_TEMPLATE = (
  chineseName: string,
): string => `你是一个专业的技术翻译助手。请将以下中文会话名称翻译为简洁的英文标识符，遵循以下规则：

1. 使用 kebab-case 格式（小写字母，单词间用短横线连接）
2. 保持语义化，能够反映原始中文的含义
3. 尽量简洁，控制在 3-5 个单词以内
4. 只返回翻译后的标识符，不要有任何其他说明文字

中文名称：${chineseName}

英文标识符：`;

export function hasNonAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return true;
  }
  return false;
}

/**
 * Translate a possibly-Chinese session name to an ASCII-safe identifier.
 *
 * - If LLM is not configured: returns a `session-<timestamp>` fallback.
 * - On any network / parse error: also returns the timestamp fallback.
 *
 * The returned string is always passed through `sanitizeIdentifier`, so it
 * is guaranteed safe for tmux session names and git branches.
 */
export async function translateToEnglishId(
  chineseName: string,
  llm: LLMConfig | undefined,
): Promise<string> {
  const fallback = `session-${Math.floor(Date.now() / 1000)}`;

  if (!llm?.enabled || !llm.api_key || !llm.model || !llm.base_url) {
    return fallback;
  }

  const timeoutMs = (llm.timeout && llm.timeout > 0 ? llm.timeout : 30) * 1000;
  const body = {
    model: llm.model,
    stream: llm.stream ?? false,
    enable_thinking: llm.enable_thinking ?? false,
    temperature: 0.2,
    messages: [{ role: 'user', content: PROMPT_TEMPLATE(chineseName) }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const start = Date.now();
    const url = `${llm.base_url.replace(/\/+$/, '')}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.api_key}`,
      },
      body: JSON.stringify(body),
    });
    log.info(
      `LLM translate ${chineseName} -> request ${Date.now() - start}ms status=${resp.status}`,
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      log.warn(`LLM API ${resp.status}: ${text.slice(0, 200)}`);
      return fallback;
    }
    const parsed = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (parsed.error) {
      log.warn(`LLM API error: ${parsed.error.message ?? ''}`);
      return fallback;
    }
    const raw = parsed.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback;
    const sanitized = sanitizeIdentifier(raw);
    if (!sanitized) return fallback;
    return sanitized;
  } catch (err) {
    log.warn('LLM translation failed', err);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make a model's free-form output safe to use as a git branch / tmux name.
 * Lowercase, hyphens for spaces, strips characters outside [a-z0-9-_], coalesces hyphens.
 */
export function sanitizeIdentifier(s: string): string {
  let out = s.toLowerCase();
  out = out.replace(/\s+/g, '-');
  out = out.replace(/[^a-z0-9\-_]+/g, '');
  out = out.replace(/-+/g, '-');
  out = out.replace(/^-+|-+$/g, '');
  return out;
}
