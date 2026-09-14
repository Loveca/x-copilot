import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { TweetDetector } from '@/lib/content/x/tweet-detector';
import { findReplyComposer } from '@/lib/content/x/composer-detector';
import { fillReplyComposer } from '@/lib/content/x/fill';
import { DEFAULT_UI_CONFIG, UI_CONFIG_STORAGE_KEY, normalizeUIConfig } from '@/lib/config';
import type { ReplyCandidate, TweetContext, UIConfig } from '@/types';
import { FloatingButton } from './FloatingButton';
import { Panel } from './Panel';
import { ReplyCard } from './ReplyCard';

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('BAD_API_KEY')) return 'API Key 无效或已过期，请点击左下角「设置」检查配置。';
  if (msg.includes('NO_API_KEY')) return '尚未配置 DeepSeek API Key，请点击左下角「设置」填入 Key。';
  if (msg.includes('NO_STYLES_ENABLED')) return '没有启用任何回复风格，请在设置 →「回复风格」中至少启用一种。';
  if (msg.includes('NETWORK_ERROR') || msg.includes('Failed to fetch'))
    return '无法连接到 DeepSeek 服务，请检查网络。';
  if (msg.includes('LLM_HTTP_429')) return '请求过于频繁，请稍后再试。';
  return '生成失败，请稍后重试。';
}

/** 按风格把候选分组（保持首次出现的顺序），同风格多条合并进一张卡 */
function groupByStyle(replies: ReplyCandidate[]): Array<{ style: string; items: ReplyCandidate[] }> {
  const groups: Array<{ style: string; items: ReplyCandidate[] }> = [];
  const index = new Map<string, number>();
  replies.forEach((r) => {
    const at = index.get(r.style);
    if (at === undefined) {
      index.set(r.style, groups.length);
      groups.push({ style: r.style, items: [r] });
    } else {
      groups[at].items.push(r);
    }
  });
  return groups;
}

export function App() {
  const [tweet, setTweet] = useState<TweetContext | null>(null);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [replies, setReplies] = useState<ReplyCandidate[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | undefined>();
  const [filledId, setFilledId] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, ReplyCandidate[]>>(new Map());
  // 生成序号：生成过程中切换 Tweet 时，旧结果作废，避免错挂到新 Tweet
  const genSeqRef = useRef(0);
  // 自动生成开关（设置页可关，改动即时生效）
  const autoGenerateRef = useRef(DEFAULT_UI_CONFIG.autoGenerate);

  useEffect(() => {
    const apply = (cfg?: Partial<UIConfig>) => {
      autoGenerateRef.current = normalizeUIConfig(cfg).autoGenerate;
    };
    browser.storage.local
      .get(UI_CONFIG_STORAGE_KEY)
      .then((res) => apply(res[UI_CONFIG_STORAGE_KEY] as Partial<UIConfig> | undefined))
      .catch(() => {});
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes[UI_CONFIG_STORAGE_KEY]) {
        apply(changes[UI_CONFIG_STORAGE_KEY].newValue as Partial<UIConfig>);
        // 风格配置变了，旧候选不再匹配，清掉缓存让它重新生成
        cacheRef.current.clear();
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  // 生成回复候选（手动「重新生成」与自动触发共用）
  const runGenerate = useCallback(async (target: TweetContext, auto: boolean) => {
    const seq = ++genSeqRef.current;
    setGenerating(true);
    setError(undefined);
    if (auto) setToast('检测到新 Tweet，正在自动生成回复……');
    try {
      const result = await browser.runtime.sendMessage({
        type: 'GENERATE_REPLIES',
        tweet: target,
        options: { count: 5 },
      });
      // 生成期间已切换到其他 Tweet：丢弃本次结果
      if (seq !== genSeqRef.current) return;
      if (Array.isArray(result) && result.length > 0) {
        setReplies(result);
        if (target.id) cacheRef.current.set(target.id, result);
        if (auto) setToast('回复已生成');
      } else {
        setError('生成失败，请稍后重试。');
      }
    } catch (e) {
      if (seq !== genSeqRef.current) return;
      setError(friendlyError(e));
    } finally {
      if (seq === genSeqRef.current) setGenerating(false);
    }
  }, []);

  // 取消在途生成（关闭 Modal / 离开 Tweet 时调用）
  const cancelGeneration = useCallback(() => {
    genSeqRef.current++;
    setGenerating(false);
  }, []);

  // Tweet 切换：自动弹出 Panel + 自动生成（缓存命中则直接展示，不重复请求）
  useEffect(() => {
    const detector = new TweetDetector();
    const unobserve = detector.observe((t) => {
      setTweet(t);
      setError(undefined);
      setToast(undefined);
      setFilledId(null);
      if (!t) {
        // Modal 关闭 / 离开 Tweet：取消在途请求，收起 Panel
        cancelGeneration();
        setReplies([]);
        setOpen(false);
        return;
      }
      const cached = t.id ? cacheRef.current.get(t.id) : undefined;
      setReplies(cached ?? []);
      setOpen(true);
      // 自动生成关闭时只弹出面板，等用户手动点「生成回复」
      if (!cached && autoGenerateRef.current) {
        void runGenerate(t, true);
      }
    });
    return unobserve;
  }, [runGenerate, cancelGeneration]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const openSettings = useCallback(async () => {
    try {
      await browser.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    } catch {
      setToast('无法打开设置页，请从 chrome://extensions 找到 X Copilot → 详情 → 扩展程序选项。');
    }
  }, []);

  const fill = useCallback(async (reply: ReplyCandidate) => {
    const composer = findReplyComposer();
    if (!composer) {
      setToast('未找到回复输入框，请先点击「回复」。');
      return;
    }
    const ok = fillReplyComposer(composer, reply.text);
    if (ok) {
      setToast('已填入，请检查后自行发送。');
      // 替换语义：只标记最新填入的一条，上一条自动恢复
      setFilledId(reply.id);
    } else {
      setToast('填入失败，请手动复制粘贴。');
    }
  }, []);

  return (
    <>
      <FloatingButton open={open} onToggle={() => setOpen((v) => !v)} />
      <Panel open={open} onClose={() => setOpen(false)} onOpenSettings={openSettings}>
        {tweet ? (
          <div className="xc-tweet-card">
            <div className="xc-tweet-author">
              {tweet.author ?? '未知用户'} {tweet.authorHandle ? `· ${tweet.authorHandle}` : ''}
            </div>
            <div className="xc-tweet-text">{tweet.text}</div>
          </div>
        ) : (
          <div className="xc-empty">
            暂时没有识别到当前 Tweet。
            <br />
            请打开一条 Tweet 详情页。
          </div>
        )}

        <button
          className="xc-generate-btn"
          onClick={() => tweet && runGenerate(tweet, false)}
          disabled={generating || !tweet}
        >
          {generating ? (
            <>
              <span className="xc-spin" />
              正在生成……
            </>
          ) : replies.length > 0 ? (
            '重新生成'
          ) : (
            '生成回复'
          )}
        </button>

        {error && <div className="xc-error">{error}</div>}

        {groupByStyle(replies).map((group) => (
          <ReplyCard
            key={group.style}
            style={group.style}
            items={group.items}
            filledId={filledId}
            onFill={fill}
          />
        ))}

        {toast && <div className="xc-toast">{toast}</div>}
      </Panel>
    </>
  );
}
