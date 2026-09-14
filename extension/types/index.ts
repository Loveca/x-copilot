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
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 交互类配置 */
export interface UIConfig {
  /** 打开/切换 Tweet 时是否自动生成评论建议 */
  autoGenerate: boolean;
  /** 回复风格配置（顺序、启用、数量） */
  styles: StyleConfig[];
}
