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
  /**
   * 主发帖框（Compose）。注意：X 给所有 composer 同一个 `tweetTextarea_*` testid，
   * 区分它们只能靠 aria-label（Post text / Post your reply）与所处的容器。
   */
  postComposer: 'div[contenteditable="true"][role="textbox"][data-testid^="tweetTextarea"]',
  /** 发帖按钮。用于验证「X 是否认账」——填入后它应从 disabled 变为可用 */
  postButton: '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
  /**
   * 右侧栏容器。X 的趋势模块（"正在流行"）只在窗口够宽时渲染，
   * 窄窗口下整个 sidebarColumn 都不存在——抓不到是正常情况，要有降级提示。
   */
  sidebarColumn: '[data-testid="sidebarColumn"]',
  /** 右侧栏里的一条趋势条目 */
  trend: '[data-testid="trend"]',
} as const;

/** 主发帖框的 aria-label 关键词（与回复框区分） */
export const POST_COMPOSER_KEYWORDS = ['post text', 'what is happening', '发帖', '有什么新鲜事'];

/** 用于识别「回复输入框」的 aria-label / placeholder 关键词 */
export const REPLY_COMPOSER_KEYWORDS = [
  'post your reply',
  'reply',
  '回帖',
  '回复',
  '發帖回覆',
  '发布你的回复',
];
