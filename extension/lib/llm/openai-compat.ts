import type { GenerateReplyOptions, LLMConfig, ReplyCandidate, TweetContext } from '@/types';
import type { LLMProvider } from './provider';

const REQUEST_TIMEOUT_MS = 30_000;

const STYLES = ['观点', '补充', '反向', '简短', '水贴'];

function buildPrompt(context: TweetContext, count: number): string {
  const parts = [
    'You are an assistant helping a user participate naturally in conversations on X.',
    '',
    'Given the current Tweet, generate possible replies.',
    '',
    'Requirements:',
    '1. Replies should sound like natural human posts on X.',
    '2. Do not simply restate the original Tweet.',
    '3. Avoid generic AI phrases such as "This is a fascinating development..." or "值得进一步关注".',
    '4. Keep replies concise, ideally under 140 characters.',
    '5. Each reply must have a distinct angle, in this order: 观点 (opinion), 补充 (addition), 反向 (counterpoint), 简短 (very short), 水贴 (casual/light).',
    '6. Preserve the language of the original Tweet: reply in the same language the Tweet is written in.',
    '7. Do not claim facts that are not supported by the Tweet.',
    '8. Respond ONLY with JSON in this exact shape: {"replies":[{"style":"...","text":"..."}]}',
    '',
    `Generate exactly ${count} replies.`,
    '',
    `Author: ${context.author ?? 'unknown'} (${context.authorHandle ?? ''})`,
    `Tweet text: ${context.text}`,
  ];
  if (context.quotedTweet?.text) {
    parts.push(`Quoted tweet by ${context.quotedTweet.author ?? 'unknown'}: ${context.quotedTweet.text}`);
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
    const count = Math.min(Math.max(options?.count ?? 5, 1), 10);
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
          messages: [{ role: 'user', content: buildPrompt(context, count) }],
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
    const replies = (parsed.replies ?? [])
      .filter((r): r is { style: string; text: string } => typeof r.text === 'string' && r.text.trim().length > 0)
      .slice(0, count)
      .map((r, i) => ({
        id: String(i + 1),
        style: r.style || STYLES[i] || `候选${i + 1}`,
        text: r.text.trim(),
      }));

    if (replies.length === 0) {
      throw new Error('INVALID_LLM_RESPONSE');
    }
    return replies;
  }
}
