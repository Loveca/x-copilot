import { X_SELECTORS } from './selectors';
import type { TrendItem } from '@/types';

/**
 * 分类标签的形状，如 "Trending in Technology" / "Trending" / "Trending with #A, #B"。
 * 这行小字说明「在哪个领域流行」，不是话题本身，要滤掉。
 */
const CATEGORY_RE = /^(trending|trends? in|trending with|正在流行|流行于|趋势|熱門)/i;

/** 帖子数那行，如 "12.3K posts" / "1.2万 条帖子" */
const POSTS_RE = /\bposts?\b|帖子|条帖|推文/i;

/**
 * 读 X 首页右侧栏「正在流行」里**已渲染**的趋势话题。
 *
 * 纯 DOM 读取：不发请求、不滚动加载、不点任何东西。
 * - 窗口太窄 / 不在首页 / X 改版 → 返回空数组，由调用方给降级提示
 * - 顺序沿用 X 自己的热度排序（rank 即序号）
 *
 * ⚠️ X 改版频繁，`trend` 这个 testid 与内部结构需要拿真实页面校准。
 * 这里刻意不依赖固定 className，只按「滤掉分类行与帖子数行后剩下的那个 span」取话题。
 */
export function collectTrends(limit = 10): TrendItem[] {
  const root = document.querySelector(X_SELECTORS.sidebarColumn);
  if (!root) return [];

  const nodes = [...root.querySelectorAll<HTMLElement>(X_SELECTORS.trend)];
  const out: TrendItem[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const spans = [...node.querySelectorAll('span')]
      .map((s) => s.textContent?.trim() ?? '')
      .filter((t) => t.length > 0);
    if (spans.length === 0) continue;

    const category = spans.find((t) => CATEGORY_RE.test(t));
    const topic = spans.find(
      (t) => !CATEGORY_RE.test(t) && !POSTS_RE.test(t) && t.length <= 80
    );
    if (!topic || seen.has(topic)) continue;

    seen.add(topic);
    out.push({ topic, category, rank: out.length + 1 });
    if (out.length >= limit) break;
  }

  return out;
}
