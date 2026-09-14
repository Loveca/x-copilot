export interface TweetContext {
  id?: string;
  url?: string;
  author?: string;
  authorHandle?: string;
  text: string;
  timestamp?: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quotedTweet?: TweetContext;
}

export interface ReplyCandidate {
  id: string;
  style: string;
  text: string;
}

/** 回复风格配置项（顺序 = 候选展示顺序） */
export interface StyleConfig {
  key: string;
  label: string;
  /** 给模型的风格说明 */
  desc: string;
  enabled: boolean;
  /** 该风格生成几条候选（1-3） */
  count: number;
}

export interface GenerateReplyOptions {
  count?: number;
  styles?: StyleConfig[];
  /** 用户想表达的核心观点（可选）。给了就让所有候选围绕它展开 */
  intent?: string;
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * 是否开启思考模式（思维链）。DeepSeek V4 / Gemini 默认**开启**，
   * 会在吐正文前先推理数秒到十几秒 —— 写回复这种任务完全用不上，默认关闭。
   * 具体参数按服务商分派（见 lib/llm/openai-compat.ts）。
   */
  thinking: boolean;
  /** 各服务商各自记住的 API Key（键为归一化后的 baseUrl），切换服务商时自动回填 */
  apiKeys?: Record<string, string>;
}

/** 交互类配置 */
export interface UIConfig {
  /** 打开/切换 Tweet 时是否自动生成回复 */
  autoGenerate: boolean;
  /** 回复风格配置（顺序、启用、数量） */
  styles: StyleConfig[];
  /** 面板底部是否显示耗时/字数等诊断信息（开发者用，默认关） */
  debugTiming: boolean;
}
