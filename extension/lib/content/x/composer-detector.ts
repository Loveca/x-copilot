import { REPLY_COMPOSER_KEYWORDS, X_SELECTORS } from './selectors';

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function looksLikeReplyBox(el: HTMLElement): boolean {
  const label = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('data-placeholder') ?? ''}`.toLowerCase();
  return REPLY_COMPOSER_KEYWORDS.some((k) => label.includes(k));
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
