import {
  DEFAULT_POST_STYLES,
  DEFAULT_STYLES,
  MAX_TOTAL_REPLIES,
  expectedStyleSequence,
} from '@/lib/config';
import type {
  GenerateOptions,
  LLMConfig,
  ReplyCandidate,
  StyleConfig,
  TweetContext,
} from '@/types';
import type { LLMProvider, LLMStreamHandlers } from './provider';
import { MAX_VISION_IMAGES } from './vision';
import { renderPrompt } from './templates';

const REQUEST_TIMEOUT_MS = 60_000;
/** 进度回调节流：避免每个 token 都往 content script 推一条消息 */
const PROGRESS_THROTTLE_MS = 250;

/**
 * 会话级能力记忆：某个模型不认图片 / 不认扩展参数时记下来，
 * 后续请求不再白费一次 400 往返。（Service Worker 被回收后重新探测，代价仅一次失败请求）
 */
const visionUnsupported = new Set<string>();
const providerParamsUnsupported = new Set<string>();

function buildPrompt(
  context: TweetContext,
  styles: StyleConfig[],
  intent?: string,
  hasImages = false
): string {
  const total = styles.reduce((sum, s) => sum + s.count, 0);
  const styleLines = styles
    .map((s, i) => `${i + 1}. ${s.label} — ${s.count} 条：${s.desc}`)
    .join('\n');
  const quoted = context.quotedTweet?.text
    ? `${context.quotedTweet.author ?? 'unknown'}: ${context.quotedTweet.text}`
    : '';
  // 纯图帖没有正文，明确告知模型，否则它会以为漏了内容而自由发挥
  const postText = context.text.trim()
    ? context.text
    : '(the post has no text, only the image(s) attached below)';
  return renderPrompt('reply', {
    author_name: context.author ?? 'unknown',
    author_handle: context.authorHandle ?? '',
    post_text: postText,
    style_config: styleLines,
    total_count: total,
    max_length: 140,
    user_intent: intent?.trim() ?? '',
    quoted_post: quoted,
    image_note: hasImages
      ? 'The target post also has image(s) attached to this message. Treat them as context for what the post is about. Do not describe or caption the image(s) unless that is clearly the point of the reply, and never state details you cannot actually see in them.'
      : '',
  });
}

/**
 * 发帖模式（Phase 2）的 Prompt。
 * 与回复不同：没有"必须贴合原推"的约束，要自己立论；
 * 但有更多输入源——用户主题、当前看的帖子（灵感）、时间线上正在热的内容。
 */
function buildPostPrompt(
  styles: StyleConfig[],
  intent?: string,
  contextTweets: TweetContext[] = [],
  inspiration?: TweetContext | null,
  topic?: string
): string {
  const total = styles.reduce((sum, s) => sum + s.count, 0);
  const styleLines = styles
    .map((s, i) => `${i + 1}. ${s.label} — ${s.count} 条：${s.desc}`)
    .join('\n');

  const parts = [
    'Help a real person write their own X post. This is NOT a reply to anybody.',
    '',
    'Rules:',
    '1. Sound like a person thinking out loud, not a brand announcement or press release.',
    '2. No generic AI phrasing, no filler encouragement, no hashtag spam.',
    '3. Under 280 characters each. Same language as the topic the user gave.',
    '4. Never invent facts, numbers, or personal experiences the user did not provide.',
    `5. Styles, in this exact order and count:\n${styleLines}`,
    `6. Total lines = ${total}. Lines of the same style must differ in angle.`,
    '7. Output ONLY one JSON object per line, no array, no code fences, no extra text:',
    '   {"style":"观点型","text":"..."}',
  ];

  if (intent) {
    parts.push('', `The user's own idea (highest priority — every line must grow out of it): "${intent}"`);
  }
  if (topic) {
    parts.push(
      '',
      'The user picked something to write about. Write an independent post about THIS',
      '(never reply to it, even if it reads like a post):',
      topic
    );
  }
  if (inspiration?.text) {
    parts.push(
      '',
      'A post the user is currently looking at. Use it only as inspiration — do NOT reply to it,',
      `write an independent post of their own: ${inspiration.authorHandle ?? 'someone'}: ${inspiration.text}`
    );
  }
  if (contextTweets.length > 0) {
    parts.push(
      '',
      'What is getting engagement on their timeline right now (context for 热点型 / 反向型 only; never copy it):'
    );
    contextTweets.forEach((t) => {
      parts.push(`- ${t.authorHandle ?? t.author ?? 'someone'}: ${t.text.slice(0, 180)}`);
    });
  }
  return parts.join('\n');
}

/**
 * 「随手发」（水贴三件套）固定的三类。
 * 只在 idea 模式内部用于校验兜底与候选分组，不进设置页、不参与 postStyles 配置，
 * 因此用户把所有发帖风格都禁用也不影响随手发。
 */
const IDEA_STYLES: StyleConfig[] = [
  { key: 'idea-insight', label: '顶级认知', desc: '反直觉但站得住的判断', enabled: true, count: 1 },
  { key: 'idea-trivia', label: '冷知识', desc: '具体、可核对的小事实', enabled: true, count: 1 },
  { key: 'idea-truth', label: '扎心真相', desc: '戳痛点但不说教的实话', enabled: true, count: 1 },
];

/**
 * 「随手发」的 Prompt。与发帖 prompt 的差别：不需要主题、不需要立论，
 * 只要三句"随时能发、跟当下无关"的成品。
 */
function buildIdeaPrompt(intent?: string): string {
  // 「随便聊聊」现在产出 3 条话题（顶级认知 / 冷知识 / 扎心真相），供用户点选后填进输入框当引子
  return renderPrompt('quickTopic', { user_input: intent?.trim() ?? '' });
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
function parseFullResponse(content: string, styles: StyleConfig[]): RawCandidate[] {
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
  expected: string[],
  /**
   * 强制按 expected 顺序贴标签（水贴用）。
   * 保证「顶级认知 / 冷知识 / 扎心真相 各一条」不会被模型标串——
   * 它只要按顺序产出三句，标签由我们盖。
   */
  forceStyle = false
): ReplyCandidate[] {
  const knownLabels = new Set(styles.map((s) => s.label));
  return raw.slice(0, MAX_TOTAL_REPLIES).map((r, i) => ({
    id: String(i + 1),
    // 模型给了合法风格名就用它，否则按用户配置的顺序兜底
    style: forceStyle
      ? expected[i] ?? styles[0].label
      : r.style && knownLabels.has(r.style)
        ? r.style
        : expected[i] ?? styles[0].label,
    text: r.text.trim(),
  }));
}

function resolveGeneration(options?: GenerateOptions): {
  styles: StyleConfig[];
  expected: string[];
  intent?: string;
  mode: 'reply' | 'post';
  /** 随手发：走内置三件套，不读 postStyles，也不带任何页面语境 */
  ideaMode: boolean;
  topic?: string;
  contextTweets: TweetContext[];
} {
  const mode: 'reply' | 'post' = options?.mode === 'post' ? 'post' : 'reply';
  const ideaMode = options?.source === 'idea';
  const fallback = mode === 'post' ? DEFAULT_POST_STYLES : DEFAULT_STYLES;
  // 随手发的三类是内置的：不受「用户把所有发帖风格都禁用了」影响
  const styles = ideaMode
    ? IDEA_STYLES
    : (options?.styles?.length ? options.styles : fallback).filter(
        (s) => s.enabled && s.count > 0
      );
  if (styles.length === 0) {
    throw new Error('NO_STYLES_ENABLED');
  }
  return {
    mode,
    ideaMode,
    styles,
    expected: expectedStyleSequence(styles),
    intent: options?.intent?.trim().slice(0, 300) || undefined,
    topic: options?.topic?.trim().slice(0, 200) || undefined,
    contextTweets: options?.contextTweets ?? [],
  };
}

function assertOkStatus(status: number): void {
  if (status === 401 || status === 403) throw new Error('BAD_API_KEY');
  if (status < 200 || status >= 300) throw new Error(`LLM_HTTP_${status}`);
}

/**
 * 按 Base URL 判定服务商，用于分派「思考模式」参数。
 * - DeepSeek：`thinking: {type: enabled|disabled}`（顶层字段，DeepSeek 专有）
 * - Gemini：`reasoning_effort`（OpenAI 兼容层支持；`none` 关闭思考，2.5 系列有效，
 *   3 系列无法完全关闭，会退到最低档）
 * - 其他：不发任何扩展参数，避免被拒
 */
type ProviderKind = 'deepseek' | 'gemini' | 'generic';

function detectProvider(baseUrl: string): ProviderKind {
  if (/deepseek/i.test(baseUrl)) return 'deepseek';
  if (/googleapis\.com/i.test(baseUrl)) return 'gemini';
  return 'generic';
}

export class OpenAICompatProvider implements LLMProvider {
  /** 本次请求实际发出的图片张数（降级重试后可能少于传入） */
  private usedImageCount = 0;
  /** 生成模式：reply = 回复；post = 写自己的帖子（Phase 2） */
  private mode: 'reply' | 'post' = 'reply';
  /** 随手发模式：用三件套 prompt，忽略选题与页面语境 */
  private ideaMode = false;
  /** 发帖选题（面板上从「热帖 / 趋势」点选的那条） */
  private topic: string | undefined;
  /** 帖子模式的时间线语境 */
  private contextTweets: TweetContext[] = [];

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
    context: TweetContext | null,
    styles: StyleConfig[],
    intent: string | undefined,
    stream: boolean,
    includeProviderParams = true,
    images: string[] = []
  ): string {
    const prompt = this.ideaMode
      ? buildIdeaPrompt(intent)
      : this.mode === 'post'
        ? buildPostPrompt(styles, intent, this.contextTweets, context, this.topic)
        : buildPrompt(context as TweetContext, styles, intent, images.length > 0);
    // 多模态消息：文字 + image_url 内容块（图片只能出现在 user 消息里，这是各家的共同约束）
    const content =
      images.length > 0
        ? [
            { type: 'text', text: prompt },
            ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ]
        : prompt;

    return JSON.stringify({
      model: this.config.model,
      messages: [{ role: 'user', content }],
      temperature: 1.0,
      ...(includeProviderParams ? this.thinkingParams() : {}),
      stream,
    });
  }

  /** 思考模式参数（按服务商分派）。空对象表示该服务商不发扩展参数 */
  private thinkingParams(): Record<string, unknown> {
    const on = this.config.thinking === true;
    switch (detectProvider(this.config.baseUrl)) {
      case 'deepseek':
        return { thinking: { type: on ? 'enabled' : 'disabled' } };
      case 'gemini':
        // Gemini 3 系列无法完全关闭思考，且不认 "none"（会 400，重试后反而退回默认档位）。
        // "minimal" 是全系列通用的最低档，2.5 系列映射到 1024 思考预算。
        return { reasoning_effort: on ? 'high' : 'minimal' };
      default:
        return {};
    }
  }

  private post(bodyText: string, signal: AbortSignal): Promise<Response> {
    return fetch(this.endpoint(), {
      method: 'POST',
      headers: this.headers(),
      body: bodyText,
      signal,
    });
  }

  /**
   * 发起请求，并在 HTTP 400 时**逐级降级**重试：
   *   带图带参 → 去掉图片 → 再去掉扩展参数
   *
   * 为什么要这样：模型是否支持图片、服务商是否认扩展参数，都不能只靠文档判断
   * （DeepSeek V4.1 Flash 与 Gemini 都原生吃图，但第三方托管的老模型会 400）。
   * 400 是参数校验失败，不产生 token 费用，所以降级探测成本极低；
   * 学到结论后记进 visionUnsupported / providerParamsUnsupported，后续不再重试。
   */
  private async requestCompletion(
    context: TweetContext | null,
    styles: StyleConfig[],
    intent: string | undefined,
    stream: boolean,
    signal: AbortSignal,
    imageDataUrls: string[] = []
  ): Promise<Response> {
    const capabilityKey = `${this.config.baseUrl}|${this.config.model}`;
    const imagesUsable =
      imageDataUrls.length > 0 && !visionUnsupported.has(capabilityKey);
    const paramsUsable =
      Object.keys(this.thinkingParams()).length > 0 &&
      !providerParamsUnsupported.has(capabilityKey);

    const attempts: Array<{ images: string[]; params: boolean; drop: string }> = [
      { images: imagesUsable ? imageDataUrls : [], params: paramsUsable, drop: '' },
    ];
    if (imagesUsable) attempts.push({ images: [], params: paramsUsable, drop: 'images' });
    if (paramsUsable) attempts.push({ images: [], params: false, drop: 'params' });

    let response: Response | undefined;
    for (const attempt of attempts) {
      response = await this.post(
        this.body(context, styles, intent, stream, attempt.params, attempt.images),
        signal
      );
      if (response.status !== 400) {
        this.usedImageCount = attempt.images.length;
        if (attempt.drop === 'images') {
          visionUnsupported.add(capabilityKey);
          console.debug('[X Copilot] model rejected images, continuing text-only');
        } else if (attempt.drop === 'params') {
          providerParamsUnsupported.add(capabilityKey);
        }
        return response;
      }
      console.debug('[X Copilot] HTTP 400, retry' + (attempt.drop ? ` without ${attempt.drop}` : ''));
    }
    return response as Response;
  }

  /** 流式生成：对象一闭合就回调，不等整段结束 */
  async generateRepliesStream(
    context: TweetContext | null,
    options: GenerateOptions | undefined,
    handlers: LLMStreamHandlers
  ): Promise<ReplyCandidate[]> {
    const { styles, expected, intent, mode, ideaMode, topic, contextTweets } =
      resolveGeneration(options);
    this.mode = mode;
    this.ideaMode = ideaMode;
    this.topic = topic;
    this.contextTweets = contextTweets;
    const imageDataUrls = (options?.imageDataUrls ?? []).slice(0, MAX_VISION_IMAGES);
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
        handlers.onPartial?.(toCandidates(raw, styles, expected, ideaMode));
      }
    };

    let response: Response;
    try {
      response = await this.requestCompletion(
        context,
        styles,
        intent,
        true,
        controller.signal,
        imageDataUrls
      );
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
        const candidates = toCandidates(parseFullResponse(text, styles), styles, expected, ideaMode);
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
          handlers.onPartial?.(toCandidates(raw, styles, expected, ideaMode));
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
        imageCount: this.usedImageCount,
      };
      handlers.onTiming?.(timing);
      console.debug('[X Copilot] stream timing', timing);
      return toCandidates(raw, styles, expected, ideaMode);
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /** 非流式生成（保留作为兜底路径） */
  async generateReplies(
    context: TweetContext | null,
    options?: GenerateOptions
  ): Promise<ReplyCandidate[]> {
    const { styles, expected, intent, mode, ideaMode, topic, contextTweets } =
      resolveGeneration(options);
    this.mode = mode;
    this.ideaMode = ideaMode;
    this.topic = topic;
    this.contextTweets = contextTweets;
    const imageDataUrls = (options?.imageDataUrls ?? []).slice(0, MAX_VISION_IMAGES);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.requestCompletion(
        context,
        styles,
        intent,
        false,
        controller.signal,
        imageDataUrls
      );
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

    const candidates = toCandidates(parseFullResponse(content, styles), styles, expected, ideaMode);
    if (candidates.length === 0) throw new Error('INVALID_LLM_RESPONSE');
    return candidates;
  }
}
