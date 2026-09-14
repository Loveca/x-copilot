import type { LLMConfig, StyleConfig, UIConfig } from '@/types';

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

/** 默认回复风格（顺序即候选顺序；desc 会写进 prompt） */
export const DEFAULT_STYLES: StyleConfig[] = [
  {
    key: 'opinion',
    label: '观点',
    desc: '明确给出自己的判断或立场',
    enabled: true,
    count: 1,
  },
  {
    key: 'addition',
    label: '补充',
    desc: '补充一个原推没提到的角度或事实面',
    enabled: true,
    count: 1,
  },
  {
    key: 'counter',
    label: '反向',
    desc: '提出有礼貌的相反看法',
    enabled: true,
    count: 1,
  },
  {
    key: 'short',
    label: '简短',
    desc: '一句话，极简，不展开',
    enabled: true,
    count: 1,
  },
  {
    key: 'casual',
    label: '水贴',
    desc: '轻松互动式的一句话，几乎没有信息量但自然',
    enabled: true,
    count: 1,
  },
];

/** 交互类配置默认值 */
export const DEFAULT_UI_CONFIG: UIConfig = {
  autoGenerate: true,
  styles: DEFAULT_STYLES,
};

export const UI_CONFIG_STORAGE_KEY = 'uiConfig';

export const MAX_COUNT_PER_STYLE = 3;
export const MAX_TOTAL_REPLIES = 10;

/**
 * 归一化 UI 配置：
 * - 补齐缺失字段（老版本存储 / 新增风格）
 * - 按默认顺序补回存储中缺失的风格项
 * - 夹取 count 范围
 */
export function normalizeUIConfig(stored?: Partial<UIConfig> | null): UIConfig {
  const rawStyles = Array.isArray(stored?.styles) ? stored!.styles : [];
  const byKey = new Map(rawStyles.map((s) => [s?.key, s]));

  const styles: StyleConfig[] = DEFAULT_STYLES.map((def) => {
    const saved = byKey.get(def.key);
    if (!saved) return { ...def };
    byKey.delete(def.key);
    return {
      key: def.key,
      label: def.label,
      desc: def.desc,
      enabled: saved.enabled !== false,
      count: clampCount(saved.count),
    };
  });

  // 存储里存在但默认清单没有的自定义风格（未来扩展位）：保留在末尾
  byKey.forEach((s) => {
    if (!s?.key) return;
    styles.push({
      key: s.key,
      label: s.label || s.key,
      desc: s.desc || '',
      enabled: s.enabled !== false,
      count: clampCount(s.count),
    });
  });

  return {
    autoGenerate: stored?.autoGenerate !== false,
    styles,
  };
}

function clampCount(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(Math.max(v, 1), MAX_COUNT_PER_STYLE);
}

/** 实际参与生成的风格（启用且有数量） */
export function activeStyles(config: UIConfig): StyleConfig[] {
  return config.styles.filter((s) => s.enabled && s.count > 0);
}

/** 预期的候选序列（按风格顺序展开，用于校验/兜底模型返回） */
export function expectedStyleSequence(styles: StyleConfig[]): string[] {
  const seq: string[] = [];
  styles.forEach((s) => {
    for (let i = 0; i < s.count; i++) seq.push(s.label);
  });
  return seq.slice(0, MAX_TOTAL_REPLIES);
}
