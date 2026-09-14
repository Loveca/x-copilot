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
import type { LLMStreamProgress, LLMStreamTiming } from '@/lib/llm/provider';
import { FloatingButton } from './FloatingButton';
import { Panel } from './Panel';
import { ReplyCard } from './ReplyCard';

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('BAD_API_KEY')) return 'API Key 无效或已过期，请点击左下角「设置」检查配置。';
  if (msg.includes('NO_API_KEY')) return '尚未配置 API Key，请点击左下角「设置」填入。';
  if (msg.includes('NO_STYLES_ENABLED')) return '没有启用任何回复风格，请在设置 →「回复风格」中至少启用一种。';
  if (msg.includes('NETWORK_ERROR') || msg.includes('Failed to fetch'))
    return '无法连接到模型服务，请检查网络或设置里的 Base URL。';
  if (msg.includes('LLM_HTTP_429')) return '请求过于频繁或超出免费额度，请稍后再试。';
  if (msg.includes('LLM_HTTP_503'))
    return '该模型当前负载过高（503），到设置里换一个模型或稍后重试。';
  if (msg.includes('LLM_HTTP_400'))
    return '请求被拒绝（400）：模型名可能不被该服务商支持，请到设置中检查服务商与模型名。';
  if (msg.includes('INVALID_LLM_RESPONSE')) return '模型返回内容无法解析，请重试或换个模型。';
  const http = msg.match(/LLM_HTTP_(\d+)/);
  if (http) return `服务端返回错误（${http[1]}），请稍后重试或检查模型配置。`;
  return '生成失败，请稍后重试。';
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const chars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

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
  const [timing, setTiming] = useState<LLMStreamTiming | undefined>();
  const [progress, setProgress] = useState<LLMStreamProgress | undefined>();
  const [elapsedMs, setElapsedMs] = useState(0);
  // 是否显示耗时/字数等诊断信息（设置页「开发者选项」开关，默认关）
  const [debugTiming, setDebugTiming] = useState(DEFAULT_UI_CONFIG.debugTiming);
  const genStartRef = useRef(0);
  const cacheRef = useRef<Map<string, ReplyCandidate[]>>(new Map());
  // 生成序号：生成过程中切换 Tweet 时，旧结果作废，避免错挂到新 Tweet
  const genSeqRef = useRef(0);
  // 当前流式生成的长连接（取消/切帖时断开）
  const activePortRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  // 自动生成开关（设置页可关，改动即时生效）
  const autoGenerateRef = useRef(DEFAULT_UI_CONFIG.autoGenerate);
  const uiConfigRef = useRef<UIConfig>(normalizeUIConfig());

  // 缓存键：同一 Tweet 下，「带意图」与「不带意图」的结果要分开存
  const cacheKey = (id?: string, intentText = '') => `${id ?? 'no-id'}::${intentText.trim()}`;

  useEffect(() => {
    const apply = (cfg?: Partial<UIConfig>) => {
      const next = normalizeUIConfig(cfg);
      // 只有回复风格真的变了才清缓存；改个开关不该让已有候选作废
      const stylesChanged =
        JSON.stringify(next.styles) !== JSON.stringify(uiConfigRef.current.styles);
      uiConfigRef.current = next;
      autoGenerateRef.current = next.autoGenerate;
      setDebugTiming(next.debugTiming);
      if (stylesChanged) cacheRef.current.clear();
    };
    browser.storage.local
      .get(UI_CONFIG_STORAGE_KEY)
      .then((res) => apply(res[UI_CONFIG_STORAGE_KEY] as Partial<UIConfig> | undefined))
      .catch(() => {});
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes[UI_CONFIG_STORAGE_KEY]) {
        apply(changes[UI_CONFIG_STORAGE_KEY].newValue as Partial<UIConfig>);
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

      // 缓存只用于「自动弹出时避免重复请求」。
      // 手动点「生成回复 / 重新生成 / 按这个想法生成」一律真发请求 ——
      // 否则缓存命中会直接返回原结果，用户看到的就是「点了没反应」。
      if (auto) {
        const cached = cacheRef.current.get(key);
        if (cached) {
          setReplies(cached);
          setError(undefined);
          return;
        }
      }

      const seq = ++genSeqRef.current;
      genStartRef.current = Date.now();
      setElapsedMs(0);
      setProgress(undefined);
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
          timing?: LLMStreamTiming;
          progress?: LLMStreamProgress;
        };
        if (seq !== genSeqRef.current) {
          port.disconnect();
          return;
        }
        if (msg.type === 'progress' && msg.progress) {
          setProgress(msg.progress);
        } else if (msg.type === 'partial' && Array.isArray(msg.replies)) {
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
      setProgress(undefined);
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

  // 生成中自行走秒：即使服务端长时间没有任何分片，界面也在动，不会看着像卡死
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - genStartRef.current), 200);
    return () => clearInterval(timer);
  }, [generating]);

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
              正在生成 {elapsedMs > 800 ? `${(elapsedMs / 1000).toFixed(1)}s` : '……'}
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

        {debugTiming && generating && (
          <div className="xc-progress">
            {progress && progress.reasoningChars > 0
              ? `模型思考中 ${chars(progress.reasoningChars)} 字`
              : progress && progress.receivedChars > 0
                ? `已接收 ${chars(progress.receivedChars)} 字`
                : '等待模型首个字符'}
            <span className="xc-progress-time">{secs(elapsedMs)}</span>
          </div>
        )}

        {debugTiming && !generating && timing && (
          <div className="xc-timing">
            首字节 {secs(timing.ttfbMs)} · 出字 {secs(timing.firstContentMs)} · 首条{' '}
            {secs(timing.firstCandidateMs)} · 完成 {secs(timing.totalMs)}
            <br />
            {timing.model ? `模型 ${timing.model}` : '模型 未知'}
            {timing.imageCount ? ` · 图片 ${timing.imageCount} 张` : ''}
            {timing.reasoningChars ? ` · 思维链 ${chars(timing.reasoningChars)} 字` : ''}
            {timing.receivedChars ? ` · 正文 ${chars(timing.receivedChars)} 字` : ''}
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
