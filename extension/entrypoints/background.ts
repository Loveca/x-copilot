import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { OpenAICompatProvider } from '@/lib/llm/openai-compat';
import {
  DEFAULT_LLM_CONFIG,
  GENERATE_PORT,
  LLM_CONFIG_STORAGE_KEY,
  UI_CONFIG_STORAGE_KEY,
  activeStyles,
  normalizeUIConfig,
} from '@/lib/config';
import type { GenerateReplyOptions, LLMConfig, TweetContext, UIConfig } from '@/types';
import type { LLMStreamTiming } from '@/lib/llm/provider';
import { fetchImagesAsDataUrls } from '@/lib/llm/vision';

async function readOptions(
  incoming?: GenerateReplyOptions
): Promise<{ config: LLMConfig; options: GenerateReplyOptions }> {
  const stored = await browser.storage.local.get([LLM_CONFIG_STORAGE_KEY, UI_CONFIG_STORAGE_KEY]);
  const config: LLMConfig = {
    ...DEFAULT_LLM_CONFIG,
    ...((stored[LLM_CONFIG_STORAGE_KEY] as object | undefined) ?? {}),
  };
  const uiConfig = normalizeUIConfig(
    stored[UI_CONFIG_STORAGE_KEY] as Partial<UIConfig> | undefined
  );
  return {
    config,
    // 回复风格由设置页配置（顺序 / 启用 / 每条数量）
    options: { ...(incoming ?? {}), styles: activeStyles(uiConfig) },
  };
}

/**
 * 帖子带图时把图取回来（并行、单张失败即跳过）。
 * 不做模型白名单：DeepSeek V4.1 Flash 与 Gemini 都原生吃图，
 * 万一遇到不认图的模型，provider 侧会在 400 时自动降级为纯文本重试。
 */
async function collectImages(tweet: TweetContext): Promise<string[]> {
  if (!tweet?.images?.length) return [];
  return fetchImagesAsDataUrls(tweet.images);
}

/**
 * Background service worker：无状态，只做 LLM 请求代理。
 * - 流式生成走 runtime.connect 长连接，逐条把候选推给 content script
 * - 其余请求走 sendMessage
 */
export default defineBackground(() => {
  // 流式生成（长连接）
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== GENERATE_PORT) return;

    port.onMessage.addListener(async (message: unknown) => {
      const msg = message as { tweet?: unknown; options?: GenerateReplyOptions };
      const send = (payload: unknown) => {
        try {
          port.postMessage(payload);
        } catch {
          /* 端口已关闭，忽略 */
        }
      };

      try {
        const { config, options } = await readOptions(msg.options);
        if (!config.apiKey) throw new Error('NO_API_KEY');

        const tweet = msg.tweet as TweetContext;
        const imageDataUrls = await collectImages(tweet);

        const provider = new OpenAICompatProvider(config);
        let timing: LLMStreamTiming | undefined;
        const replies = await provider.generateRepliesStream(
          tweet,
          { ...options, imageDataUrls },
          {
            onPartial: (partial) => send({ type: 'partial', replies: partial }),
            onProgress: (progress) => send({ type: 'progress', progress }),
            onTiming: (t) => {
              timing = t;
            },
          }
        );
        send({ type: 'done', replies, timing });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    });
  });

  // 其余消息（打开设置页、非流式兜底）
  browser.runtime.onMessage.addListener(async (message: unknown) => {
    const msg = message as { type?: string; tweet?: unknown; options?: GenerateReplyOptions };

    if (msg?.type === 'OPEN_OPTIONS') {
      await browser.runtime.openOptionsPage();
      return;
    }

    if (msg?.type !== 'GENERATE_REPLIES') return;

    const { config, options } = await readOptions(msg.options);
    if (!config.apiKey) throw new Error('NO_API_KEY');

    const tweet = msg.tweet as TweetContext;
    const imageDataUrls = await collectImages(tweet);

    const provider = new OpenAICompatProvider(config);
    return provider.generateReplies(tweet, { ...options, imageDataUrls });
  });
});
