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

/**
 * 当前 Tweet 判定：URL 主判 + DOM 字段提取。
 * X 打开 Tweet（含 Timeline Modal）都会 pushState 更新 URL，
 * 因此 URL 是「哪条是当前 Tweet」的可靠信号；DOM 只负责字段抽取。
 */
export class TweetDetector {
  getCurrentTweet(): TweetContext | null {
    const match = location.pathname.match(STATUS_URL_RE);
    if (!match) return null;
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

  /**
   * 监听当前 Tweet 变化。仅在 Tweet 真正变化时回调（debounce + id 比较）。
   * 返回取消监听函数。
   */
  observe(callback: (tweet: TweetContext | null) => void): () => void {
    let lastId: string | null = null;

    const check = () => {
      const match = location.pathname.match(STATUS_URL_RE);
      const id = match ? match[2] : null;
      if (id === lastId) return;
      lastId = id;
      callback(id ? this.getCurrentTweet() : null);
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
