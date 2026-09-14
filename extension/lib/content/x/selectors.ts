/**
 * X DOM selector 集中管理（唯一来源）。
 * X 改版时只改这个文件，不要把 selector 散落到业务代码。
 */
export const X_SELECTORS = {
  /** 单条 Tweet 容器 */
  tweetArticle: 'article[data-testid="tweet"]',
  /** Tweet 正文 */
  tweetText: '[data-testid="tweetText"]',
  /** 作者名 + @handle 区域 */
  userName: '[data-testid="User-Name"]',
  /** 时间元素（含 datetime 属性） */
  time: 'time',
  /** 互动数据按钮组 */
  reply: '[data-testid="reply"]',
  retweet: '[data-testid="retweet"]',
  like: '[data-testid="like"]',
  /** Reply 按钮（Tweet 底部动作栏） */
  replyAction: '[data-testid="reply"]',
  /** 输入框：X 的 composer 是 contenteditable + role=textbox */
  composer: 'div[contenteditable="true"][role="textbox"]',
  /**
   * 推文里的照片附件。只在 pbs.twimg.com/media/ 下取，因此天然排除：
   * - 头像（/profile_images/）
   * - 视频封面（/amplify_video_thumb/）
   * - 表情（/emoji/）
   */
  photoImage: 'img[src*="pbs.twimg.com/media/"]',
} as const;

/** 用于识别「回复输入框」的 aria-label / placeholder 关键词 */
export const REPLY_COMPOSER_KEYWORDS = [
  'post your reply',
  'reply',
  '回帖',
  '回复',
  '發帖回覆',
  '发布你的回复',
];
