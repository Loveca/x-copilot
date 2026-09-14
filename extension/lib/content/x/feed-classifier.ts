import type { CleanerConfig, SpamCategory, SpamVerdict, TweetContext } from '@/types';

/**
 * 垃圾内容判定引擎（纯函数，不碰 DOM）。
 *
 * 设计原则：**规则为主，LLM 按需**。
 * 评论区无限滚动，实时性是硬约束；而模板化 bot 评论（例如
 * 「应该没人比我玩的更开了吧🥑🪄…不信你看」）表面特征极强，规则足够抓。
 */

/** 归一化：去掉 emoji / 变体选择符 / 标点 / 符号 / 数字 / 空白，只留语言字符 */
export function signature(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\p{M}]/gu, '') // 变体选择符（️）等组合标记，留在里面会干扰相似度
    .replace(/[\s\p{P}\p{S}\d]/gu, '')
    .toLowerCase();
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** 参与重复判定的最短归一化长度：太短（"哈哈"）不参与，避免误判 */
const MIN_SIG_LEN = 6;
/**
 * 判定为"近似重复"的相似度阈值（字符 bigram Jaccard）。
 *
 * 实测校准：
 *   bot 样本 A/B（差一个字）      = 0.667  → 应判重复
 *   正常评论 C/D（用词接近）      = 0.545  → 不应判重复
 * 取 0.65 既抓得住 A/B，也给正常评论留出约 0.1 的余量。
 */
export const SIMILARITY_THRESHOLD = 0.65;

/** 字符多样性下限：低于此值视为重复语气词（"哈哈哈哈"），不参与重复判定 */
const MIN_CHAR_DIVERSITY = 0.25;

/** 关键词表：命中即判（保持克制，宁可少判也不错杀） */
const KEYWORDS: Record<Exclude<SpamCategory, 'repeat' | 'bot'>, string[]> = {
  adult: ['约炮', '一夜情', '福利姬', '看片', '裸聊', '上门服务', '成人'],
  gamble: ['博彩', '菠菜', '澳门', '投注', '开户送', '彩票', '赌场'],
  scam: ['加微信', '加微', '私聊我', '带你飞', '稳赚', '日入过万', '致富', '导师带单', '刷单'],
  ad: ['优惠券', '限时折扣', '下单', '返利', '代理招', '厂家直供'],
};

const CATEGORY_LABEL: Record<SpamCategory, string> = {
  repeat: '重复刷屏',
  bot: '机器人账号',
  adult: '色情引流',
  gamble: '赌博引流',
  scam: '诈骗引流',
  ad: '广告推广',
};

export function categoryLabel(c: SpamCategory): string {
  return CATEGORY_LABEL[c];
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length < 2) {
    if (s.length === 1) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach((v) => {
    if (b.has(v)) inter++;
  });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 找出与 target 高度相似的其它内容。
 *
 * 为什么不能只比"归一化后全等"：真实 bot 评论会做微小变体——
 *   A: 应该没人比👆我玩的**更**开了吧🥑🪄我福不黑不信你看 l 9 ❤
 *   B: 应该没人比我玩的开了吧☠️🗯️我福不黑不信你看
 * A 多一个「更」字，全等匹配永远抓不到，但两者字符 bigram 相似度约 0.8。
 */
export function findSimilar(
  target: TweetContext,
  others: TweetContext[],
  threshold = SIMILARITY_THRESHOLD
): { count: number; best: number } {
  const sig = signature(target.text);
  if (sig.length < MIN_SIG_LEN) return { count: 0, best: 0 };
  // 重复语气词（哈哈哈…、对对对…）字符多样性极低，不该被当成刷屏
  if (new Set(sig).size / sig.length < MIN_CHAR_DIVERSITY) return { count: 0, best: 0 };
  const targetGrams = bigrams(sig);

  let count = 0;
  let best = 0;
  others.forEach((other) => {
    if (other === target) return;
    const otherSig = signature(other.text);
    if (otherSig.length < MIN_SIG_LEN) return;
    if (new Set(otherSig).size / otherSig.length < MIN_CHAR_DIVERSITY) return;
    const score = jaccard(targetGrams, bigrams(otherSig));
    if (score > best) best = score;
    if (score >= threshold) count++;
  });
  return { count, best };
}

/**
 * 判定单条内容。返回 null 表示正常。
 * @param all 同一批可见内容（用于近似重复比对），需包含被判定的这一条
 */
export function classifyTweet(
  tweet: TweetContext,
  all: TweetContext[],
  config: CleanerConfig
): SpamVerdict | null {
  if (!config.enabled) return null;
  if (!tweet.text) return null;

  const sig = signature(tweet.text);

  // 1) 用户显式要求"永远隐藏此类内容"
  if (sig && config.alwaysHideSignatures.includes(sig)) {
    return { category: 'repeat', reason: '你之前选择永远隐藏这类内容', signals: ['你标记过'] };
  }

  // 2) 白名单：关注的账号 / 认证账号
  if (config.whitelistFollowing && tweet.isFollowing) return null;
  if (config.whitelistVerified && tweet.isVerified) return null;

  // 3) 近似重复刷屏（对模板化 bot 评论最有效）
  if (config.categories.repeat) {
    const { count, best } = findSimilar(tweet, all);
    if (count >= 1) {
      return {
        category: 'repeat',
        reason: `与页面上另外 ${count} 条内容高度重复`,
        signals: ['文本模板雷同', `相似度约 ${Math.round(best * 100)}%`],
      };
    }
  }

  // 4) 关键词命中
  const keywordCategories: Array<Exclude<SpamCategory, 'repeat' | 'bot'>> = [
    'adult',
    'gamble',
    'scam',
    'ad',
  ];
  for (const category of keywordCategories) {
    if (!config.categories[category]) continue;
    const hits = KEYWORDS[category].filter((w) => tweet.text.includes(w));
    if (hits.length > 0) {
      return {
        category,
        reason: `命中${CATEGORY_LABEL[category]}关键词`,
        signals: hits.slice(0, 3),
      };
    }
  }

  // 5) 机器人账号特征：handle 以长串数字结尾 + 短文本 / 多 emoji
  if (config.categories.bot) {
    const handle = (tweet.authorHandle ?? '').replace('@', '');
    const emojiCount = (tweet.text.match(EMOJI_RE) ?? []).length;
    const numericTail = /\d{6,}$/.test(handle);
    if (numericTail && (emojiCount >= 2 || tweet.text.length < 40)) {
      return {
        category: 'bot',
        reason: '账号名是长串数字，内容短而模板化',
        signals: ['数字账号后缀', `emoji ${emojiCount} 个`],
      };
    }
  }

  return null;
}
