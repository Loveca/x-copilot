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

/** 单条帖子最多带几张图（X 单帖上限就是 4 张） */
const MAX_TWEET_IMAGES = 4;

/**
 * 提取本条帖子的照片附件，统一改写成 `?format=jpg&name=small`：
 * - 统一格式，避免 webp/png 混杂
 * - small 约 680px，几十 KB，够模型看清又不浪费带宽与 token
 * 只取本层的图：引用帖的图不算在内（引用帖的正文已进 prompt）。
 */
function extractImages(article: Element): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  const imgs = [...article.querySelectorAll<HTMLImageElement>(X_SELECTORS.photoImage)];
  for (const img of imgs) {
    // 位于嵌套 article（引用帖）里的图不属于本条帖子
    if (img.closest(X_SELECTORS.tweetArticle) !== article) continue;

    const src = img.getAttribute('src') ?? '';
    const base = src.match(/^https:\/\/pbs\.twimg\.com\/media\/[^?#]+/)?.[0];
    if (!base) continue;

    const normalized = `${base}?format=jpg&name=small`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length >= MAX_TWEET_IMAGES) break;
  }
  return urls;
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

  // Clean 模块白名单：认证账号 / 已关注账号
  const isVerified = article.querySelector('[data-testid="icon-verified"]') !== null;
  const isFollowing = /(following|正在关注|已关注|正在跟隨)/i.test(userNameEl?.textContent ?? '');

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
    isFollowing,
    isVerified,
  };

  // 帖子图片（照片附件，最多 4 张）
  const images = extractImages(article);
  if (images.length > 0) context.images = images;

  // 引用推文：主 article 内嵌套的第一层 article（仅提取一层）
  const quoted = article.querySelector(`${X_SELECTORS.tweetArticle} ${X_SELECTORS.tweetArticle}`);
  if (quoted && quoted !== article) {
    context.quotedTweet = extractArticle(quoted);
  }
  return context;
}

/**
 * 时间线语境：当前页面可见帖子中互动量最高的若干条。
 * Phase 2 发帖模式用它给「热点型 / 反向型」提供"现在大家在聊什么"的背景。
 */
export function collectTimelineTweets(limit = 5): TweetContext[] {
  const articles = [...document.querySelectorAll<HTMLElement>(X_SELECTORS.tweetArticle)];
  const seen = new Set<string>();
  const list: TweetContext[] = [];

  articles.forEach((a) => {
    const t = extractArticle(a);
    if (!t.text) return;
    const key = t.id ?? t.text.slice(0, 60);
    if (seen.has(key)) return;
    seen.add(key);
    list.push(t);
  });

  const score = (t: TweetContext) => (t.likeCount ?? 0) + (t.replyCount ?? 0) + (t.repostCount ?? 0);
  return list.sort((a, b) => score(b) - score(a)).slice(0, limit);
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
/** 单条帖子 + 它的 DOM 元素（Clean 模块需要元素引用才能折叠） */
export interface TweetEntry {
  tweet: TweetContext;
  el: HTMLElement;
}

/**
 * 收集当前页面可作为「回复 / 时间线项」的帖子（含元素引用）。
 * - 排除主推文本身（详情页里它就是 URL 上那条）
 * - 排除嵌套在其它 article 里的引用推文
 */
export function collectReplyTweets(mainId?: string): TweetEntry[] {
  const out: TweetEntry[] = [];
  const seen = new Set<string>();

  const articles = [...document.querySelectorAll<HTMLElement>(X_SELECTORS.tweetArticle)];
  articles.forEach((el) => {
    // 引用推文是嵌套在另一个 article 里的，不算独立条目
    if (el.parentElement?.closest(X_SELECTORS.tweetArticle)) return;

    const tweet = extractArticle(el);
    if (!tweet.text) return;
    if (mainId && tweet.id === mainId) return;

    const key = tweet.id ?? signatureOf(tweet.text);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ tweet, el });
  });
  return out;
}

function signatureOf(text: string): string {
  return text.slice(0, 60);
}

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
      // 纯图帖没有正文，只有附件 —— 只要有图就算一条有效帖子
      if (!context.text && !(context.images?.length ?? 0)) return null;
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
      const hasImages = article.querySelector(X_SELECTORS.photoImage) !== null;
      // 纯图帖（无正文）也要能识别，不能因为没文字就当没检测到
      if (!text && !hasImages) continue;

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
