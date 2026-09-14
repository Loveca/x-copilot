import type { LLMConfig, StyleConfig, UIConfig } from '@/types';

/**
 * 默认 LLM 配置：DeepSeek（OpenAI 兼容协议）。
 * API key 由用户在 Options 页填写，存 chrome.storage.local，绝不硬编码。
 */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-flash',
  apiKey: '',
  // 关掉思考模式：V4 默认开启且 effort=high，首条候选要等十几秒，得不偿失
  thinking: false,
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

/** 流式生成使用的长连接端口名（background 与 content script 共用） */
export const GENERATE_PORT = 'generate-replies';

export const MAX_COUNT_PER_STYLE = 3;
export const MAX_TOTAL_REPLIES = 10;

/**
 * 归一化 UI 配置：
 * - **保留存储中的风格顺序**（顺序是用户的显式配置，不能被默认顺序覆盖）
 * - 补齐缺失字段（老版本存储 / 新增风格）：默认清单里新增的风格追加在末尾
 * - 夹取 count 范围
 */
export function normalizeUIConfig(stored?: Partial<UIConfig> | null): UIConfig {
  return {
    autoGenerate: stored?.autoGenerate !== false,
    styles: normalizeStyles(stored?.styles),
  };
}

function normalizeStyles(stored?: StyleConfig[] | null): StyleConfig[] {
  const savedList = Array.isArray(stored) ? stored : [];
  const defaultsByKey = new Map(DEFAULT_STYLES.map((d) => [d.key, d]));
  const seen = new Set<string>();
  const result: StyleConfig[] = [];

  // 1) 按存储中的顺序还原（label/desc 以默认清单为准，保证 prompt 文案同步更新）
  savedList.forEach((s) => {
    if (!s?.key || seen.has(s.key)) return;
    seen.add(s.key);
    const def = defaultsByKey.get(s.key);
    result.push({
      key: s.key,
      label: def?.label ?? s.label ?? s.key,
      desc: def?.desc ?? s.desc ?? '',
      enabled: s.enabled !== false,
      count: clampCount(s.count),
    });
  });

  // 2) 默认清单里存在但存储中没有的风格（新增功能）追加在末尾
  DEFAULT_STYLES.forEach((def) => {
    if (!seen.has(def.key)) result.push({ ...def });
  });

  return result;
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
