import { X_SELECTORS } from './selectors';
import type { TweetContext } from '@/types';

const STATUS_URL_RE = /^\/([^/]+)\/status\/(\d+)/;

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function parseCount(el: Element | null): number | undefined {
  if (!el) return undefined;
  const label = el.getAttribute('aria-label') ?? '';
  const match = label.replace(/,/g, '').match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function extractArticle(article: Element, id?: string, handleHint?: string): TweetContext {
  const text =
    article.querySelector(X_SELECTORS.tweetText)?.textContent?.trim() ?? '';

  let author: string | undefined;
  let authorHandle = handleHint ? `@${handleHint}` : undefined;
  const userNameEl = article.querySelector(X_SELECTORS.userName);
  if (userNameEl) {
    const nameSpan = userNameEl.querySelector('span');
    if (nameSpan?.textContent) author = nameSpan.textContent.trim();
    const handleLink = [...userNameEl.querySelectorAll('a[href^="/"]')]
      .map((a) => a.getAttribute('href') ?? '')
      .find((href) => /^\/[A-Za-z0-9_]{1,15}$/.test(href));
    if (handleLink) authorHandle = handleLink;
  }

  const timeEl = article.querySelector(X_SELECTORS.time);
  const timestamp = timeEl?.getAttribute('datetime') ?? undefined;

  const likeCount = parseCount(article.querySelector(X_SELECTORS.like));
  const repostCount = parseCount(article.querySelector(X_SELECTORS.retweet));
  const replyCount = parseCount(article.querySelector(X_SELECTORS.reply));

  const context: TweetContext = {
    id,
    url: id && authorHandle ? `https://x.com${authorHandle}/status/${id}` : undefined,
    author,
    authorHandle,
    text,
    timestamp,
    likeCount,
    repostCount,
    replyCount,
  };

  // 引用推文：主 article 内嵌套的第一层 article（仅提取一层）
  const quoted = article.querySelector(`${X_SELECTORS.tweetArticle} ${X_SELECTORS.tweetArticle}`);
  if (quoted && quoted !== article) {
    context.quotedTweet = extractArticle(quoted);
  }
  return context;
}

/** 调试日志：DevTools Console 里过滤 [X Copilot] 即可查看 */
const log = (...args: unknown[]) => console.debug('[X Copilot]', ...args);

function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * 当前 Tweet 判定：URL 主判 + Reply Modal 兜底 + DOM 字段提取。
 * - 打开 Tweet 详情（含 Timeline 点进 Modal）时 X 会 pushState 更新 URL；
 * - 但在 x.com/home 里点回复图标弹出的 Reply Modal 不改变 URL，
 *   此时从可见 dialog 内的被回复帖子 article 提取上下文。
 */
export class TweetDetector {
  getCurrentTweet(): TweetContext | null {
    const match = location.pathname.match(STATUS_URL_RE);
    if (match) {
      const [, handle, id] = match;

      const articles = [...document.querySelectorAll<HTMLElement>(X_SELECTORS.tweetArticle)];
      if (articles.length === 0) return null;

      // 优先取包含该 status 链接的 article，兜底取第一个
      const main =
        articles.find((a) => a.querySelector(`a[href$="/status/${id}"]`)) ?? articles[0];

      const context = extractArticle(main, id, handle);
      if (!context.text) return null;
      return context;
    }
    return this.getReplyModalTweet();
  }

  /**
   * Reply Modal（x.com/home 点回复图标弹出，URL 不变）：
   * 从可见 dialog 中取被回复的 tweet article。
   */
  private getReplyModalTweet(): TweetContext | null {
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
      ...document.querySelectorAll<HTMLElement>('[aria-labelledby="modal-header"]'),
    ];
    for (const dialog of dialogs) {
      if (dialog.getClientRects().length === 0) continue; // 只看可见 dialog
      const article = dialog.querySelector(X_SELECTORS.tweetArticle);
      if (!article) continue; // 发帖 Modal 等不含 tweet，跳过
      const text = article.querySelector(X_SELECTORS.tweetText)?.textContent?.trim() ?? '';
      if (!text) continue;

      // 被回复帖子的 status 链接（时间戳链接，位于嵌套引用帖之前）
      const href = article.querySelector('a[href*="/status/"]')?.getAttribute('href') ?? '';
      const fromHref = href.match(/\/status\/(\d+)/)?.[1];
      const handle = href.match(/^\/([^/]+)\/status/)?.[1];

      // 拿不到 status id 时生成稳定合成 key（时间戳 / 文本哈希），避免检测失效
      const id =
        fromHref ??
        `modal-${hashKey(
          (handle ?? '') + (article.querySelector('time')?.getAttribute('datetime') ?? '') + text.slice(0, 80)
        )}`;

      log('reply modal tweet detected:', { id, handle, text: text.slice(0, 40) });
      return extractArticle(article, id, handle);
    }
    return null;
  }

  /**
   * 监听当前 Tweet 变化。仅在 Tweet 真正变化时回调（debounce + id 比较）。
   * 返回取消监听函数。
   */
  observe(callback: (tweet: TweetContext | null) => void): () => void {
    let lastId: string | null = null;
    let nullTimer: ReturnType<typeof setTimeout> | undefined;

    const check = () => {
      const tweet = this.getCurrentTweet();
      const id = tweet?.id ?? null;
      if (id === lastId) return;

      if (id === null) {
        // 过渡态保护：Modal 挂载等场景会造成瞬间"页面上没有 article"，
        // 不立即相信 null，延迟复查确认后才真正判定离开。
        // （否则详情页点回复图标会误发 null → 取消生成 → 重新生成）
        if (nullTimer) return;
        nullTimer = setTimeout(() => {
          nullTimer = undefined;
          const t = this.getCurrentTweet();
          if (t?.id) {
            if (t.id !== lastId) {
              lastId = t.id;
              log('current tweet changed (delayed):', t.id, t.authorHandle ?? '');
              callback(t);
            }
          } else {
            lastId = null;
            log('current tweet cleared');
            callback(null);
          }
        }, 400);
        return;
      }

      if (nullTimer) {
        clearTimeout(nullTimer);
        nullTimer = undefined;
      }
      lastId = id;
      log('current tweet changed:', id, tweet?.authorHandle ?? '');
      callback(tweet);
    };

    const debouncedCheck = debounce(check, 300);
    const observer = new MutationObserver(debouncedCheck);
    observer.observe(document.body, { childList: true, subtree: true });

    // SPA 路由：包裹 pushState / replaceState，并监听 popstate
    const wrap = (name: 'pushState' | 'replaceState') => {
      const original = history[name].bind(history);
      history[name] = (...args: Parameters<History['pushState']>) => {
        const result = original(...args);
        debouncedCheck();
        return result;
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', debouncedCheck);

    check();

    return () => observer.disconnect();
  }
}
