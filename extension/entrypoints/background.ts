import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { OpenAICompatProvider } from '@/lib/llm/openai-compat';
import { DEFAULT_LLM_CONFIG, LLM_CONFIG_STORAGE_KEY } from '@/lib/config';

/**
 * Background service worker：无状态，只做 LLM 请求代理。
 * 从 content script 直接 fetch 外部 API 会有 CORS / key 暴露问题，
 * 因此所有请求统一从这里发出。
 */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message: unknown) => {
    const msg = message as { type?: string; tweet?: unknown; options?: unknown };
    if (msg?.type !== 'GENERATE_REPLIES') return;

    const stored = await browser.storage.local.get(LLM_CONFIG_STORAGE_KEY);
    const config = {
      ...DEFAULT_LLM_CONFIG,
      ...((stored[LLM_CONFIG_STORAGE_KEY] as object | undefined) ?? {}),
    };
    if (!config.apiKey) {
      throw new Error('NO_API_KEY');
    }

    const provider = new OpenAICompatProvider(config);
    return provider.generateReplies(
      msg.tweet as Parameters<typeof provider.generateReplies>[0],
      msg.options as Parameters<typeof provider.generateReplies>[1]
    );
  });
});
