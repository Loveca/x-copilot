import { DEFAULT_STYLES, MAX_TOTAL_REPLIES, expectedStyleSequence } from '@/lib/config';
import type {
  GenerateReplyOptions,
  LLMConfig,
  ReplyCandidate,
  StyleConfig,
  TweetContext,
} from '@/types';
import type { LLMProvider, LLMStreamHandlers } from './provider';

const REQUEST_TIMEOUT_MS = 60_000;

function buildPrompt(context: TweetContext, styles: StyleConfig[], intent?: string): string {
  const total = styles.reduce((sum, s) => sum + s.count, 0);
  const styleLines = styles
    .map((s, i) => `${i + 1}. ${s.label} — ${s.count} 条：${s.desc}`)
    .join('\n');

  const parts = [
    'You are an assistant helping a user participate naturally in conversations on X.',
    '',
    'Given the current Tweet, generate possible replies.',
    '',
    'Requirements:',
    '1. Replies should sound like natural human posts on X.',
    '2. Do not simply restate the original Tweet.',
    '3. Avoid generic AI phrases such as "This is a fascinating development..." or "值得进一步关注".',
    '4. Keep each reply concise, ideally under 140 characters.',
    `5. Produce replies ONLY in the styles listed below, in this exact order, with these exact counts:\n${styleLines}`,
    `6. Total replies must be exactly ${total}. Replies of the same style must have different angles from each other.`,
    '7. Preserve the language of the original Tweet: reply in the same language the Tweet is written in.',
    '8. Do not claim facts that are not supported by the Tweet.',
    '9. Output format: one JSON object per line (NDJSON), written in the order above, one line per reply,',
    '   with no array brackets, no code fences and no extra commentary — write each line as soon as it is ready:',
    '   {"style":"观点","text":"..."}',
    '   {"style":"观点","text":"..."}',
    '',
    `Author: ${context.author ?? 'unknown'} (${context.authorHandle ?? ''})`,
    `Tweet text: ${context.text}`,
  ];

  if (intent) {
    parts.push(
      '',
      'MOST IMPORTANT — the user already knows what they want to say. Their own words:',
      `"${intent}"`,
      'Every reply must clearly convey THIS point, phrased naturally in the given style',
      '(do not quote it verbatim, do not add unrelated claims, keep the meaning accurate).',
      "Keep the same language as the original Tweet unless the user's wording is in another language."
    );
  }

  if (context.quotedTweet?.text) {
    parts.push(
      `Quoted tweet by ${context.quotedTweet.author ?? 'unknown'}: ${context.quotedTweet.text}`
    );
  }
  return parts.join('\n');
}

interface RawCandidate {
  style?: string;
  text: string;
}

/** 解析单行：容忍代码栅栏、数组括号、尾随逗号等模型常见噪音 */
function parseCandidateLine(raw: string): RawCandidate | null {
  let line = raw.trim();
  if (!line) return null;
  line = line.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  line = line.replace(/^[[,]+/, '').replace(/[,\]]+$/, '').trim();
  if (!line || line === '[' || line === ']') return null;

  try {
    const obj = JSON.parse(line) as RawCandidate;
    if (typeof obj?.text === 'string' && obj.text.trim()) return obj;
  } catch {
    /* 落到正则兜底 */
  }

  const textMatch = line.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (textMatch) {
    try {
      const text = JSON.parse(`"${textMatch[1]}"`) as string;
      const styleMatch = line.match(/"style"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      let style: string | undefined;
      if (styleMatch) {
        try {
          style = JSON.parse(`"${styleMatch[1]}"`) as string;
        } catch {
          style = undefined;
        }
      }
      if (text.trim()) return { style, text };
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** 整段文本 → 候选列表（解析整个 JSON 或逐行 NDJSON，两种都吃） */
function parseFullResponse(
  content: string,
  styles: StyleConfig[],
  expected: string[]
): RawCandidate[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // 先试整体 JSON（有的模型仍会返回数组）
  const stripped = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    try {
      const parsed = JSON.parse(stripped) as { replies?: RawCandidate[] } | RawCandidate[];
      const arr = Array.isArray(parsed) ? parsed : parsed.replies;
      if (Array.isArray(arr)) {
        return arr.filter((r) => typeof r?.text === 'string' && r.text.trim());
      }
    } catch {
      /* 落到逐行解析 */
    }
  }

  return stripped
    .split('\n')
    .map((line) => parseCandidateLine(line))
    .filter((c): c is RawCandidate => c !== null);
}

function toCandidates(
  raw: RawCandidate[],
  styles: StyleConfig[],
  expected: string[]
): ReplyCandidate[] {
  const knownLabels = new Set(styles.map((s) => s.label));
  return raw.slice(0, MAX_TOTAL_REPLIES).map((r, i) => ({
    id: String(i + 1),
    // 模型给了合法风格名就用它，否则按用户配置的顺序兜底
    style: r.style && knownLabels.has(r.style) ? r.style : expected[i] ?? styles[0].label,
    text: r.text.trim(),
  }));
}

function resolveStyles(options?: GenerateReplyOptions): {
  styles: StyleConfig[];
  expected: string[];
  intent?: string;
} {
  const styles = (options?.styles?.length ? options.styles : DEFAULT_STYLES).filter(
    (s) => s.enabled && s.count > 0
  );
  if (styles.length === 0) {
    throw new Error('NO_STYLES_ENABLED');
  }
  return {
    styles,
    expected: expectedStyleSequence(styles),
    intent: options?.intent?.trim().slice(0, 300) || undefined,
  };
}

function assertOkStatus(status: number): void {
  if (status === 401 || status === 403) throw new Error('BAD_API_KEY');
  if (status < 200 || status >= 300) throw new Error(`LLM_HTTP_${status}`);
}

export class OpenAICompatProvider implements LLMProvider {
  constructor(private config: LLMConfig) {}

  private endpoint(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private body(
    context: TweetContext,
    styles: StyleConfig[],
    intent: string | undefined,
    stream: boolean
  ): string {
    return JSON.stringify({
      model: this.config.model,
      messages: [{ role: 'user', content: buildPrompt(context, styles, intent) }],
      temperature: 1.0,
      stream,
    });
  }

  /** 流式生成：逐行解析 NDJSON，候选一到就回调 */
  async generateRepliesStream(
    context: TweetContext,
    options: GenerateReplyOptions | undefined,
    handlers: LLMStreamHandlers
  ): Promise<ReplyCandidate[]> {
    const { styles, expected, intent } = resolveStyles(options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: this.headers(),
        body: this.body(context, styles, intent, true),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      throw new Error('NETWORK_ERROR');
    }

    try {
      assertOkStatus(response.status);

      if (!response.body) {
        // 环境不支持流式读取：退化为一次性读取
        const text = await response.text();
        clearTimeout(timer);
        const candidates = toCandidates(parseFullResponse(text, styles, expected), styles, expected);
        if (candidates.length === 0) throw new Error('INVALID_LLM_RESPONSE');
        handlers.onPartial?.(candidates);
        return candidates;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let lineBuffer = '';
      const raw: RawCandidate[] = [];

      const flushLines = (flushRemainder = false) => {
        let idx: number;
        while ((idx = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.slice(0, idx);
          lineBuffer = lineBuffer.slice(idx + 1);
          const parsed = parseCandidateLine(line);
          if (parsed && raw.length < MAX_TOTAL_REPLIES) {
            raw.push(parsed);
            handlers.onPartial?.(toCandidates(raw, styles, expected));
          }
        }
        if (flushRemainder && lineBuffer.trim()) {
          const parsed = parseCandidateLine(lineBuffer);
          lineBuffer = '';
          if (parsed && raw.length < MAX_TOTAL_REPLIES) {
            raw.push(parsed);
            handlers.onPartial?.(toCandidates(raw, styles, expected));
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = sseBuffer.indexOf('\n')) >= 0) {
          const rawLine = sseBuffer.slice(0, nl).trim();
          sseBuffer = sseBuffer.slice(nl + 1);
          if (!rawLine.startsWith('data:')) continue;
          const payload = rawLine.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              lineBuffer += delta;
              flushLines();
            }
          } catch {
            /* 忽略无法解析的分片 */
          }
        }
      }

      flushLines(true);
      clearTimeout(timer);

      if (raw.length === 0) throw new Error('INVALID_LLM_RESPONSE');
      return toCandidates(raw, styles, expected);
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /** 非流式生成（保留作为兜底路径） */
  async generateReplies(
    context: TweetContext,
    options?: GenerateReplyOptions
  ): Promise<ReplyCandidate[]> {
    const { styles, expected, intent } = resolveStyles(options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: this.headers(),
        body: this.body(context, styles, intent, false),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      throw new Error('NETWORK_ERROR');
    }
    clearTimeout(timer);

    assertOkStatus(response.status);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('INVALID_LLM_RESPONSE');

    const candidates = toCandidates(parseFullResponse(content, styles, expected), styles, expected);
    if (candidates.length === 0) throw new Error('INVALID_LLM_RESPONSE');
    return candidates;
  }
}
