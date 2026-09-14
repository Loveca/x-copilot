import { POST_COMPOSER_KEYWORDS, REPLY_COMPOSER_KEYWORDS, X_SELECTORS } from './selectors';

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function composerLabel(el: HTMLElement): string {
  return `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('data-placeholder') ?? ''}`.toLowerCase();
}

function looksLikeReplyBox(el: HTMLElement): boolean {
  const label = composerLabel(el);
  return REPLY_COMPOSER_KEYWORDS.some((k) => label.includes(k));
}

function looksLikePostBox(el: HTMLElement): boolean {
  const label = composerLabel(el);
  return POST_COMPOSER_KEYWORDS.some((k) => label.includes(k));
}

/**
 * 查找当前可见的 Reply composer。
 * X 的输入框是 <div contenteditable="true" role="textbox">，
 * 不依赖固定 className，优先用 aria-label / role / contenteditable 判定。
 */
export function findReplyComposer(): HTMLElement | null {
  const boxes = [...document.querySelectorAll<HTMLElement>(X_SELECTORS.composer)];
  const visible = boxes.filter(isVisible);
  if (visible.length === 0) return null;

  const labeled = visible.find(looksLikeReplyBox);
  return labeled ?? visible[0];
}

/**
 * 查找主发帖框（Phase 2 Post Copilot 用）。
 *
 * X 给所有 composer 同一个 `tweetTextarea_*` testid，所以按这个顺序判定：
 *   1. 去掉明确的回复框（aria-label 含 reply / 回复 等）
 *   2. 弹窗里的优先 —— 用户主动点开发帖/回复弹窗时，它就是当前目标
 *   3. 否则取 aria-label 像"Post text"的那个（首页时间线的主发帖框）
 *   4. 兜底取第一个可见 composer
 */
export function findPostComposer(): HTMLElement | null {
  const visible = [...document.querySelectorAll<HTMLElement>(X_SELECTORS.composer)].filter(
    isVisible
  );
  if (visible.length === 0) return null;

  const notReply = visible.filter((el) => !looksLikeReplyBox(el));
  // 页面上只剩回复框时直接放弃：宁可提示用户先打开发帖框，
  // 也不能把"发帖草稿"悄悄写进回复框（那就是回复，不是发帖了）
  if (notReply.length === 0) return null;
  const pool = notReply;

  const inDialog = pool.find((el) => el.closest('[role="dialog"]'));
  if (inDialog) return inDialog;

  const labeled = pool.find(looksLikePostBox);
  if (labeled) return labeled;

  const tagged = pool.find((el) =>
    (el.getAttribute('data-testid') ?? '').startsWith('tweetTextarea')
  );
  return tagged ?? pool[0];
}

/**
 * 发帖按钮是否可用。
 * 这是「X 认账」的判据：只把文字塞进 DOM 不算成功，必须让 X 自己的状态更新
 * （Post 按钮从 disabled 变可用），说明编辑器确实接管了这段文本。
 * 返回 null 表示没找到按钮。
 */
export function isPostButtonEnabled(): boolean | null {
  const btn = [...document.querySelectorAll<HTMLElement>(X_SELECTORS.postButton)].find(isVisible);
  if (!btn) return null;
  return !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
}
