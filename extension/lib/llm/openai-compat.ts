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
/** 进度回调节流：避免每个 token 都往 content script 推一条消息 */
const PROGRESS_THROTTLE_MS = 250;

function buildPrompt(context: TweetContext, styles: StyleConfig[], intent?: string): string {
  const total = styles.reduce((sum, s) => sum + s.count, 0);
  const styleLines = styles
    .map((s, i) => `${i + 1}. ${s.label} — ${s.count} 条：${s.desc}`)
    .join('\n');

  const parts = [
    'Write natural replies to the X post below, as if written by a real person.',
    '',
    'Rules:',
    '1. Never restate the post. No generic AI phrasing ("值得进一步关注" etc).',
    '2. Under 140 characters each. Same language as the post. Never invent facts.',
    `3. Styles, in this exact order and count:\n${styleLines}`,
    `4. Total lines = ${total}. Lines of the same style must differ in angle.`,
    '5. Output ONLY one JSON object per line, no array, no code fences, no extra text;',
    '   write each line as soon as it is ready:',
    '   {"style":"观点","text":"..."}',
    '',
    `Post by ${context.author ?? 'unknown'} (${context.authorHandle ?? ''}):`,
    context.text,
  ];

  if (intent) {
    parts.push(
      '',
      'MOST IMPORTANT — the user already knows what to say. Their words:',
      `"${intent}"`,
      'Every line must convey THIS point, phrased naturally per its style',
      '(no verbatim quoting, no unrelated claims).'
    );
  }

  if (context.quotedTweet?.text) {
    parts.push(
      `Quoted post by ${context.quotedTweet.author ?? 'unknown'}: ${context.quotedTweet.text}`
    );
  }
  return parts.join('\n');
}

interface RawCandidate {
  style?: string;
  text: string;
}

function isCandidate(v: unknown): v is RawCandidate {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as RawCandidate).text === 'string' &&
    !!(v as RawCandidate).text.trim()
  );
}

/**
 * 从增量文本里切出所有「已闭合的 JSON 对象」。
 *
 * 为什么不用按换行切分：模型经常把结果压成一行（数组或粘连的对象），
 * 那样只有等整段结束才出现换行，逐行解析会退化成「一次性全出来」。
 * 按大括号配对切分则不依赖换行——对象一闭合就能立刻解析。
 * 嵌套对象也会被收集，交给上层按「是否含 text 字段」筛掉。
 */
function drainObjects(buffer: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  const stack: number[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push(i);
    else if (ch === '}' && stack.length > 0) {
      const start = stack.pop() as number;
      objects.push(buffer.slice(start, i + 1));
    }
  }

  // 未闭合的部分（最外层那个 { 之后）留到下一轮
  const rest = stack.length > 0 ? buffer.slice(stack[0]) : '';
  return { objects, rest };
}

/** 单个已闭合片段 → 候选；结构不合法就丢弃（宁可少一条也不出错行） */
function candidatesFromFragment(fragment: string): RawCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fragment);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed.filter(isCandidate);
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { replies?: unknown; text?: unknown; style?: unknown };
    if (Array.isArray(obj.replies)) return obj.replies.filter(isCandidate);
    if (typeof obj.text === 'string' && obj.text.trim()) {
      return [{ style: typeof obj.style === 'string' ? obj.style : undefined, text: obj.text }];
    }
  }
  return [];
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

/** 纯文本行兜底：模型完全无视 JSON 时，按「风格：内容」或「1. 内容」解析 */
function parsePlainLines(text: string, styles: StyleConfig[]): RawCandidate[] {
  const labels = styles.map((s) => s.label);
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith('{') || t.startsWith('[')) return null;
      for (const label of labels) {
        if (t.startsWith(label)) {
          const rest = t
            .slice(label.length)
            .replace(/^[：:\s]+/, '')
            .trim();
          if (rest) return { style: label, text: rest } as RawCandidate;
        }
      }
      const numbered = t.match(/^\d+[.、)]\s*(.+)$/);
      if (numbered) return { text: numbered[1].trim() } as RawCandidate;
      return null;
    })
    .filter((c): c is RawCandidate => c !== null);
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

  const byLine = stripped
    .split('\n')
    .map((line) => parseCandidateLine(line))
    .filter((c): c is RawCandidate => c !== null);
  if (byLine.length > 0) return byLine;

  return parsePlainLines(stripped, styles);
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
      // DeepSeek 思考模式开关：OpenAI 兼容端点下就是请求体的顶层字段。
      // 默认关 —— 开启时模型会先输出一大段 reasoning_content 才吐正文，
      // 写回复这种任务用不上，白等十几秒。
      thinking: { type: this.config.thinking === true ? 'enabled' : 'disabled' },
      stream,
    });
  }

  /** 流式生成：对象一闭合就回调，不等整段结束 */
  async generateRepliesStream(
    context: TweetContext,
    options: GenerateReplyOptions | undefined,
    handlers: LLMStreamHandlers
  ): Promise<ReplyCandidate[]> {
    const { styles, expected, intent } = resolveStyles(options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();

    let ttfbMs = 0;
    let firstContentMs = 0;
    let firstCandidateMs = 0;
    let receivedChars = 0;
    let reasoningChars = 0;
    let servedModel = '';
    let lastProgressAt = 0;
    let loggedChunks = 0;

    const raw: RawCandidate[] = [];
    const seen = new Set<string>();

    const reportProgress = (force = false) => {
      if (!handlers.onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
      lastProgressAt = now;
      handlers.onProgress({
        elapsedMs: now - startedAt,
        receivedChars,
        reasoningChars,
      });
    };

    const emitFragments = (fragments: string[]) => {
      let added = false;
      for (const fragment of fragments) {
        for (const cand of candidatesFromFragment(fragment)) {
          if (raw.length >= MAX_TOTAL_REPLIES) break;
          const dedupeKey = `${cand.style ?? ''}\u0000${cand.text}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          raw.push(cand);
          added = true;
        }
        if (raw.length >= MAX_TOTAL_REPLIES) break;
      }
      if (added) {
        if (!firstCandidateMs) firstCandidateMs = Date.now() - startedAt;
        handlers.onPartial?.(toCandidates(raw, styles, expected));
      }
    };

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
        const elapsed = Date.now() - startedAt;
        handlers.onTiming?.({ ttfbMs: elapsed, firstContentMs: elapsed, firstCandidateMs: elapsed, totalMs: elapsed });
        handlers.onPartial?.(candidates);
        return candidates;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let braceBuffer = '';
      let allText = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!ttfbMs) {
          ttfbMs = Date.now() - startedAt;
          reportProgress(true);
        }
        sseBuffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = sseBuffer.indexOf('\n')) >= 0) {
          const rawLine = sseBuffer.slice(0, nl).trim();
          sseBuffer = sseBuffer.slice(nl + 1);
          if (!rawLine.startsWith('data:')) continue;
          const payload = rawLine.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          if (loggedChunks < 3) {
            loggedChunks++;
            console.debug('[X Copilot] sse chunk #' + loggedChunks, payload.slice(0, 240));
          }

          let chunk: {
            model?: string;
            choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
          };
          try {
            chunk = JSON.parse(payload) as typeof chunk;
          } catch {
            continue; // 忽略无法解析的分片
          }

          if (chunk.model && !servedModel) servedModel = chunk.model;
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // 思维链分片：模型在「想」，不是在哑火（DeepSeek 用 reasoning_content）
          if (delta.reasoning_content) {
            reasoningChars += delta.reasoning_content.length;
            reportProgress();
          }

          if (delta.content) {
            if (!firstContentMs) firstContentMs = Date.now() - startedAt;
            receivedChars += delta.content.length;
            allText += delta.content;
            braceBuffer += delta.content;
            const { objects, rest } = drainObjects(braceBuffer);
            braceBuffer = rest;
            if (objects.length > 0) emitFragments(objects);
            reportProgress();
          }
        }
      }

      // 收尾：未闭合的尾巴 + 整段兜底
      if (braceBuffer.trim()) emitFragments([braceBuffer]);
      if (raw.length === 0 && allText.trim()) emitFragments([allText]);
      if (raw.length === 0 && allText.trim()) {
        const plain = parsePlainLines(allText, styles);
        if (plain.length > 0) {
          raw.push(...plain.slice(0, MAX_TOTAL_REPLIES));
          if (!firstCandidateMs) firstCandidateMs = Date.now() - startedAt;
          handlers.onPartial?.(toCandidates(raw, styles, expected));
        }
      }
      clearTimeout(timer);

      if (raw.length === 0) throw new Error('INVALID_LLM_RESPONSE');

      const totalMs = Date.now() - startedAt;
      const timing = {
        ttfbMs: ttfbMs || totalMs,
        firstContentMs: firstContentMs || totalMs,
        firstCandidateMs: firstCandidateMs || totalMs,
        totalMs,
        model: servedModel || undefined,
        reasoningChars,
        receivedChars,
      };
      handlers.onTiming?.(timing);
      console.debug('[X Copilot] stream timing', timing);
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
