import type { SpamVerdict } from '@/types';
import { categoryLabel } from './clean-classifier';

/**
 * 把被判定为垃圾的帖子折叠成一条占位条。
 *
 * 注意：占位条插在 **X 页面的 DOM** 里（不是我们的 Shadow DOM），
 * 所以拿不到 components/styles.ts 里的样式，必须用内联样式。
 *
 * 幂等：处理过的 article 打上 data-xc-cleaned。X 的虚拟列表会重排并重复
 * 注入同一个节点，不打标记会重复折叠、越叠越多。
 */

const CLEANED_FLAG = 'xc-cleaned';

export interface HideHandlers {
  /** 用户点「显示」：展开本条，且本次会话不再自动隐藏 */
  onShow: (el: HTMLElement) => void;
  /** 用户点「永远隐藏此类内容」 */
  onAlways: (el: HTMLElement) => void;
}

function makeButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute(
    'style',
    [
      'border:1px solid #cfd9de',
      'border-radius:9999px',
      'padding:4px 11px',
      'font-size:12px',
      'font-weight:700',
      'font-family:inherit',
      'cursor:pointer',
      'background:#ffffff',
      primary ? 'color:#ffffff;background:#0f1419;border-color:#0f1419' : 'color:#0f1419',
    ].join(';')
  );
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function isHidden(el: HTMLElement): boolean {
  return el.dataset[CLEANED_FLAG] === '1';
}

export function hideTweet(el: HTMLElement, verdict: SpamVerdict, handlers: HideHandlers): boolean {
  if (isHidden(el)) return false;

  const card = document.createElement('div');
  card.dataset.xcHiddenPlaceholder = '1';
  card.setAttribute(
    'style',
    [
      'margin:0',
      'padding:10px 14px',
      'border-top:1px solid #eff3f4',
      'border-bottom:1px solid #eff3f4',
      'background:#f7f9f9',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif',
      'display:flex',
      'flex-direction:column',
      'gap:9px',
    ].join(';')
  );

  const head = document.createElement('div');
  head.setAttribute('style', 'display:flex;align-items:center;gap:8px;flex-wrap:wrap');

  const badge = document.createElement('span');
  badge.textContent = '已隐藏';
  badge.setAttribute(
    'style',
    'font-size:11px;font-weight:700;color:#ffffff;background:#0f1419;border-radius:9999px;padding:2px 9px'
  );

  const reason = document.createElement('span');
  reason.textContent = `${categoryLabel(verdict.category)} · ${verdict.reason}`;
  reason.setAttribute('style', 'font-size:12px;color:#536471');

  head.appendChild(badge);
  head.appendChild(reason);

  const actions = document.createElement('div');
  actions.setAttribute('style', 'display:flex;gap:6px;flex-wrap:wrap');

  const details = document.createElement('div');
  details.setAttribute('style', 'font-size:12px;color:#536471;line-height:1.6;display:none');
  details.textContent = `判定依据：${verdict.signals.join(' / ')}`;

  const showBtn = makeButton('显示', () => {
    restoreTweet(el);
    handlers.onShow(el);
  }, true);
  const whyBtn = makeButton('为什么隐藏？', () => {
    const open = details.style.display !== 'none';
    details.style.display = open ? 'none' : 'block';
    whyBtn.textContent = open ? '为什么隐藏？' : '收起依据';
  });
  const alwaysBtn = makeButton('永远隐藏此类', () => {
    handlers.onAlways(el);
    alwaysBtn.textContent = '已记住';
    alwaysBtn.disabled = true;
    alwaysBtn.setAttribute('style', alwaysBtn.getAttribute('style') + ';opacity:.5;cursor:default');
  });

  actions.appendChild(showBtn);
  actions.appendChild(whyBtn);
  actions.appendChild(alwaysBtn);

  card.appendChild(head);
  card.appendChild(actions);
  card.appendChild(details);

  el.parentNode?.insertBefore(card, el);
  el.style.display = 'none';
  el.dataset[CLEANED_FLAG] = '1';
  return true;
}

/** 展开：移除占位条并恢复原节点 */
export function restoreTweet(el: HTMLElement): void {
  const prev = el.previousElementSibling as HTMLElement | null;
  if (prev?.dataset?.xcHiddenPlaceholder === '1') prev.remove();
  el.style.display = '';
  delete el.dataset[CLEANED_FLAG];
}

/** 只移除占位条（用于重新扫描前的清理） */
export function resetAllHidden(): void {
  document
    .querySelectorAll<HTMLElement>('[data-xc-hidden-placeholder="1"]')
    .forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>('[data-xc-cleaned="1"]').forEach((el) => {
    el.style.display = '';
    delete (el as HTMLElement & { dataset: DOMStringMap }).dataset[CLEANED_FLAG];
  });
}
