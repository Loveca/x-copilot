import type { LLMConfig } from '@/types';

/**
 * 默认 LLM 配置：DeepSeek（OpenAI 兼容协议）。
 * API key 由用户在 Options 页填写，存 chrome.storage.local，绝不硬编码。
 */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-flash',
  apiKey: '',
};

export const LLM_CONFIG_STORAGE_KEY = 'llmConfig';
