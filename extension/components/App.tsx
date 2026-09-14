import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { TweetDetector } from '@/lib/content/x/tweet-detector';
import { findReplyComposer } from '@/lib/content/x/composer-detector';
import { fillReplyComposer } from '@/lib/content/x/fill';
import {
  DEFAULT_UI_CONFIG,
  GENERATE_PORT,
  UI_CONFIG_STORAGE_KEY,
  normalizeUIConfig,
} from '@/lib/config';
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
  const [intent, setIntent] = useState('');
  const [timing, setTiming] = useState<
    { ttfbMs: number; firstCandidateMs: number; totalMs: number } | undefined
  >();
  const cacheRef = useRef<Map<string, ReplyCandidate[]>>(new Map());
  // 生成序号：生成过程中切换 Tweet 时，旧结果作废，避免错挂到新 Tweet
  const genSeqRef = useRef(0);
  // 当前流式生成的长连接（取消/切帖时断开）
  const activePortRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  // 自动生成开关（设置页可关，改动即时生效）
  const autoGenerateRef = useRef(DEFAULT_UI_CONFIG.autoGenerate);

  // 缓存键：同一 Tweet 下，「带意图」与「不带意图」的结果要分开存
  const cacheKey = (id?: string, intentText = '') => `${id ?? 'no-id'}::${intentText.trim()}`;

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

  // 生成回复候选（流式：候选一到就先渲染；手动与自动触发共用）
  const runGenerate = useCallback(
    async (target: TweetContext, auto: boolean, intentText = '') => {
      const cleanIntent = intentText.trim();
      const key = cacheKey(target.id, cleanIntent);

      // 同一 Tweet + 同一意图已生成过：直接用缓存，不重复请求
      const cached = cacheRef.current.get(key);
      if (cached) {
        setReplies(cached);
        setError(undefined);
        return;
      }

      const seq = ++genSeqRef.current;
      setGenerating(true);
      setError(undefined);
      if (auto) setToast('检测到新 Tweet，正在自动生成回复……');

      const port = browser.runtime.connect({ name: GENERATE_PORT });
      activePortRef.current = port;
      let settled = false;

      port.onMessage.addListener((raw: unknown) => {
        const msg = raw as {
          type?: string;
          replies?: ReplyCandidate[];
          message?: string;
          timing?: { ttfbMs: number; firstCandidateMs: number; totalMs: number };
        };
        if (seq !== genSeqRef.current) {
          port.disconnect();
          return;
        }
        if (msg.type === 'partial' && Array.isArray(msg.replies)) {
          // 逐条到达：先渲染出来，用户可以先看/先填
          setReplies(msg.replies);
        } else if (msg.type === 'done' && Array.isArray(msg.replies)) {
          settled = true;
          activePortRef.current = null;
          setReplies(msg.replies);
          cacheRef.current.set(key, msg.replies);
          if (msg.timing) setTiming(msg.timing);
          if (auto) setToast('回复已生成');
          setGenerating(false);
          port.disconnect();
        } else if (msg.type === 'error') {
          settled = true;
          activePortRef.current = null;
          setError(friendlyError(new Error(msg.message ?? '')));
          setGenerating(false);
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        if (settled || seq !== genSeqRef.current) return;
        // 连接意外中断（如 Service Worker 被回收）
        activePortRef.current = null;
        setGenerating(false);
        setError('生成中断，请重试。');
      });

      port.postMessage({ tweet: target, options: { intent: cleanIntent || undefined } });
    },
    []
  );

  // 取消在途生成（关闭 Modal / 离开 Tweet 时调用）
  const cancelGeneration = useCallback(() => {
    genSeqRef.current++;
    activePortRef.current?.disconnect();
    activePortRef.current = null;
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
      setIntent('');
      setTiming(undefined);
      if (!t) {
        // Modal 关闭 / 离开 Tweet：取消在途请求，收起 Panel
        cancelGeneration();
        setReplies([]);
        setOpen(false);
        return;
      }
      const cached = cacheRef.current.get(cacheKey(t.id, ''));
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

        {tweet && (
          <input
            className="xc-intent"
            type="text"
            value={intent}
            maxLength={200}
            placeholder="想说什么？（可选，例如：他这套逻辑忽略了汇率）"
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !generating && tweet) {
                void runGenerate(tweet, false, intent);
              }
            }}
          />
        )}

        <button
          className="xc-generate-btn"
          onClick={() => tweet && runGenerate(tweet, false, intent)}
          disabled={generating || !tweet}
        >
          {generating ? (
            <>
              <span className="xc-spin" />
              正在生成……
            </>
          ) : intent.trim() ? (
            '按这个想法生成'
          ) : replies.length > 0 ? (
            '重新生成'
          ) : (
            '生成回复'
          )}
        </button>

        {error && <div className="xc-error">{error}</div>}

        {!generating && timing && (
          <div className="xc-timing">
            首个数据 {(timing.ttfbMs / 1000).toFixed(1)}s · 首条 {(timing.firstCandidateMs / 1000).toFixed(1)}s
            · 完成 {(timing.totalMs / 1000).toFixed(1)}s
          </div>
        )}

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
