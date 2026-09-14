import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { OpenAICompatProvider } from '@/lib/llm/openai-compat';
import {
  DEFAULT_LLM_CONFIG,
  LLM_CONFIG_STORAGE_KEY,
  UI_CONFIG_STORAGE_KEY,
  activeStyles,
  normalizeUIConfig,
} from '@/lib/config';
import type { GenerateReplyOptions, TweetContext, UIConfig } from '@/types';

/**
 * Background service worker：无状态，只做 LLM 请求代理。
 * 从 content script 直接 fetch 外部 API 会有 CORS / key 暴露问题，
 * 因此所有请求统一从这里发出。
 */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message: unknown) => {
    const msg = message as { type?: string; tweet?: unknown; options?: unknown };

    if (msg?.type === 'OPEN_OPTIONS') {
      await browser.runtime.openOptionsPage();
      return;
    }

    if (msg?.type !== 'GENERATE_REPLIES') return;

    const stored = await browser.storage.local.get([LLM_CONFIG_STORAGE_KEY, UI_CONFIG_STORAGE_KEY]);
    const config = {
      ...DEFAULT_LLM_CONFIG,
      ...((stored[LLM_CONFIG_STORAGE_KEY] as object | undefined) ?? {}),
    };
    if (!config.apiKey) {
      throw new Error('NO_API_KEY');
    }

    // 回复风格由设置页配置（顺序 / 启用 / 每条数量）
    const uiConfig = normalizeUIConfig(stored[UI_CONFIG_STORAGE_KEY] as Partial<UIConfig> | undefined);
    const options: GenerateReplyOptions = {
      ...((msg.options as GenerateReplyOptions | undefined) ?? {}),
      styles: activeStyles(uiConfig),
    };

    const provider = new OpenAICompatProvider(config);
    return provider.generateReplies(msg.tweet as TweetContext, options);
  });
});

