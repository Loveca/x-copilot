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
  /** 作者是否是用户已关注的账号（Clean 模块白名单用） */
  isFollowing?: boolean;
  /** 作者是否是认证账号（Clean 模块白名单用） */
  isVerified?: boolean;
  quotedTweet?: TweetContext;
  /** 帖子里的照片附件（已归一化为 pbs.twimg.com 的 small 变体，最多 4 张） */
  images?: string[];
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

export interface GenerateOptions {
  count?: number;
  styles?: StyleConfig[];
  /** 生成模式：reply = 回复当前推文（默认）；post = 写自己的帖子 */
  mode?: 'reply' | 'post';
  /** 用户想表达的核心观点（可选）。给了就让所有候选围绕它展开 */
  intent?: string;
  /** 帖子图片，已由 background 取回并编码为 data URL（取不到时为空数组） */
  imageDataUrls?: string[];
  /** 时间线语境：当前页面互动较高的若干条帖子（发帖模式的热点型用） */
  contextTweets?: TweetContext[];
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

/** 垃圾内容类别（PROJECT.md §25） */
export type SpamCategory = 'repeat' | 'bot' | 'adult' | 'gamble' | 'scam' | 'ad';

/** 判定结果：命中哪一类、依据是什么 */
export interface SpamVerdict {
  category: SpamCategory;
  /** 给用户看的一句话理由 */
  reason: string;
  /** 命中的具体信号（关键词 / 特征名） */
  signals: string[];
}

/** Clean 模块配置（PROJECT.md §25 Phase 5） */
export interface CleanerConfig {
  /** 总开关 */
  enabled: boolean;
  /** 各类别是否启用 */
  categories: Record<SpamCategory, boolean>;
  /** 豁免我关注的账号 */
  whitelistFollowing: boolean;
  /** 豁免认证账号 */
  whitelistVerified: boolean;
  /** 用户点过「永远隐藏此类内容」后记下的文本签名（归一化后的文本） */
  alwaysHideSignatures: string[];
  /** 累计隐藏条数，仅用于设置页展示 */
  hiddenCount: number;
}

/** 交互类配置 */
export interface UIConfig {
  /** 打开/切换 Tweet 时是否自动生成回复 */
  autoGenerate: boolean;
  /** 回复风格配置（顺序、启用、数量） */
  styles: StyleConfig[];
  /** 发帖风格配置（Phase 2 Post Copilot，与回复风格分开） */
  postStyles: StyleConfig[];
  /** Clean 模块：垃圾评论 / 帖子清理（PROJECT.md §25） */
  cleaner: CleanerConfig;
  /** 面板底部是否显示耗时/字数等诊断信息（开发者用，默认关） */
  debugTiming: boolean;
}
