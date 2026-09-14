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

export interface GenerateReplyOptions {
  count?: number;
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 交互类配置（扩展点：主题、连击设置等） */
export interface UIConfig {
  /** 打开/切换 Tweet 时是否自动生成评论建议 */
  autoGenerate: boolean;
}
