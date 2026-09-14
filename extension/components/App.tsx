import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { TweetDetector } from '@/lib/content/x/tweet-detector';
import { findReplyComposer } from '@/lib/content/x/composer-detector';
import { fillReplyComposer } from '@/lib/content/x/fill';
import type { ReplyCandidate, TweetContext } from '@/types';
import { FloatingButton } from './FloatingButton';
import { Panel } from './Panel';
import { ReplyCard } from './ReplyCard';

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('BAD_API_KEY')) return 'API Key 无效或已过期，请在插件选项页检查配置。';
  if (msg.includes('NO_API_KEY')) return '尚未配置 DeepSeek API Key，请右键插件图标 → 选项，填入 Key。';
  if (msg.includes('NETWORK_ERROR') || msg.includes('Failed to fetch'))
    return '无法连接到 DeepSeek 服务，请检查网络。';
  if (msg.includes('LLM_HTTP_429')) return '请求过于频繁，请稍后再试。';
  return '生成失败，请稍后重试。';
}

export function App() {
  const [tweet, setTweet] = useState<TweetContext | null>(null);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [replies, setReplies] = useState<ReplyCandidate[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | undefined>();
  const [filledIds, setFilledIds] = useState<Set<string>>(new Set());
  const cacheRef = useRef<Map<string, ReplyCandidate[]>>(new Map());

  // Tweet 切换：更新状态，优先用缓存
  useEffect(() => {
    const detector = new TweetDetector();
    const unobserve = detector.observe((t) => {
      setTweet(t);
      setError(undefined);
      setToast(undefined);
      const cached = t?.id ? cacheRef.current.get(t.id) : undefined;
      setReplies(cached ?? []);
      setFilledIds(new Set());
    });
    return unobserve;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const generate = useCallback(async () => {
    if (generating) return;
    if (!tweet) {
      setError('暂时没有识别到当前 Tweet。请打开一条 Tweet 详情页再试。');
      return;
    }
    setGenerating(true);
    setError(undefined);
    try {
      const result = await browser.runtime.sendMessage({
        type: 'GENERATE_REPLIES',
        tweet,
        options: { count: 5 },
      });
      if (Array.isArray(result) && result.length > 0) {
        setReplies(result);
        if (tweet.id) cacheRef.current.set(tweet.id, result);
      } else {
        setError('生成失败，请稍后重试。');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setGenerating(false);
    }
  }, [generating, tweet]);

  const openSettings = useCallback(async () => {
    try {
      await browser.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    } catch {
      setToast('无法打开设置页，请从 chrome://extensions 找到 X Copilot → 详情 → 扩展程序选项。');
    }
  }, []);

  const fill = useCallback(
    async (reply: ReplyCandidate) => {
      const composer = findReplyComposer();
      if (!composer) {
        setToast('未找到评论输入框，请先点击 Reply。');
        return;
      }
      const ok = fillReplyComposer(composer, reply.text);
      if (ok) {
        setToast('已填入，请检查后自行发送。');
        setFilledIds((prev) => new Set(prev).add(reply.id));
      } else {
        setToast('填入失败，请手动复制粘贴。');
      }
    },
    []
  );

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

        <button className="xc-generate-btn" onClick={generate} disabled={generating || !tweet}>
          {generating ? (
            <>
              <span className="xc-spin" />
              正在生成……
            </>
          ) : replies.length > 0 ? (
            '重新生成'
          ) : (
            '生成评论建议'
          )}
        </button>

        {error && <div className="xc-error">{error}</div>}

        {replies.map((r) => (
          <ReplyCard key={r.id} reply={r} filled={filledIds.has(r.id)} onFill={() => fill(r)} />
        ))}

        {toast && <div className="xc-toast">{toast}</div>}
      </Panel>
    </>
  );
}
