import {
  DEFAULT_STYLES,
  MAX_TOTAL_REPLIES,
  expectedStyleSequence,
} from '@/lib/config';
import type {
  GenerateReplyOptions,
  LLMConfig,
  ReplyCandidate,
  StyleConfig,
  TweetContext,
} from '@/types';
import type { LLMProvider } from './provider';

const REQUEST_TIMEOUT_MS = 30_000;

function buildPrompt(context: TweetContext, styles: StyleConfig[]): string {
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
    '9. Respond ONLY with JSON in this exact shape: {"replies":[{"style":"<风格名>","text":"..."}]}',
    '',
    `Author: ${context.author ?? 'unknown'} (${context.authorHandle ?? ''})`,
    `Tweet text: ${context.text}`,
  ];
  if (context.quotedTweet?.text) {
    parts.push(
      `Quoted tweet by ${context.quotedTweet.author ?? 'unknown'}: ${context.quotedTweet.text}`
    );
  }
  return parts.join('\n');
}

function extractJson(content: string): { replies?: Array<{ style?: string; text?: string }> } {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('INVALID_LLM_RESPONSE');
  }
}

export class OpenAICompatProvider implements LLMProvider {
  constructor(private config: LLMConfig) {}

  async generateReplies(
    context: TweetContext,
    options?: GenerateReplyOptions
  ): Promise<ReplyCandidate[]> {
    const styles = (options?.styles?.length ? options.styles : DEFAULT_STYLES).filter(
      (s) => s.enabled && s.count > 0
    );
    if (styles.length === 0) {
      throw new Error('NO_STYLES_ENABLED');
    }

    const expected = expectedStyleSequence(styles);
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: buildPrompt(context, styles) }],
          temperature: 1.0,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      throw new Error('NETWORK_ERROR');
    }
    clearTimeout(timer);

    if (response.status === 401 || response.status === 403) {
      throw new Error('BAD_API_KEY');
    }
    if (!response.ok) {
      throw new Error(`LLM_HTTP_${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('INVALID_LLM_RESPONSE');
    }

    const parsed = extractJson(content);
    const knownLabels = new Set(styles.map((s) => s.label));
    const replies = (parsed.replies ?? [])
      .filter(
        (r): r is { style?: string; text: string } =>
          typeof r.text === 'string' && r.text.trim().length > 0
      )
      .slice(0, MAX_TOTAL_REPLIES)
      .map((r, i) => ({
        id: String(i + 1),
        // 模型给了合法风格名就用它，否则按用户配置的顺序兜底
        style: r.style && knownLabels.has(r.style) ? r.style : expected[i] ?? styles[0].label,
        text: r.text.trim(),
      }));

    if (replies.length === 0) {
      throw new Error('INVALID_LLM_RESPONSE');
    }
    return replies;
  }
}
