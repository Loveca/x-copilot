import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  TweetDetector,
  collectReplyTweets,
  collectTimelineTweets,
} from '@/lib/content/x/tweet-detector';
import { classifyTweet, signature } from '@/lib/content/x/clean-classifier';
import { hideTweet, resetAllHidden } from '@/lib/content/x/clean-hider';
import { findReplyComposer, findPostComposer, isPostButtonEnabled } from '@/lib/content/x/composer-detector';
import { collectTrends } from '@/lib/content/x/trend-detector';
import { fillReplyComposer, fillComposer } from '@/lib/content/x/fill';
import {
  DEFAULT_UI_CONFIG,
  GENERATE_PORT,
  UI_CONFIG_STORAGE_KEY,
  normalizeUIConfig,
} from '@/lib/config';
import type { ReplyCandidate, TrendItem, TweetContext, UIConfig } from '@/types';
import type { LLMStreamProgress, LLMStreamTiming } from '@/lib/llm/provider';
import { CandidateRow } from './CandidateRow';
import { ReplyCard } from './ReplyCard';
import { FloatingButton } from './FloatingButton';
import { Panel, type CopilotMode } from './Panel';

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('BAD_API_KEY')) return 'API Key 无效或已过期，请点击左下角「设置」检查配置。';
  if (msg.includes('NO_API_KEY')) return '尚未配置 API Key，请点击左下角「设置」填入。';
  if (msg.includes('NO_STYLES_ENABLED')) return '没有启用任何风格，请在设置里至少启用一种。';
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

// Clean 模块（评论清理）当前暂停：保留全部代码，仅关闭「打开帖子 / 评论区变化时自动扫描」的自动行为。
// 面板底部的「盾 + 清理」按钮仍可在用户手动点击时运行一次扫描；后续完善后把此开关置为 true 即可恢复。
const CLEAN_AUTO_ENABLED = false;

/** M0 Spike 用的测试文本：明显是测试，方便用户一眼识别并删除 */
const POST_SPIKE_TEXT =
  '【X Copilot 发帖框测试】这段文字用于验证主发帖框能否被写入，请手动删除，不要发送。';

/** 「灵感来源」区的三个 tab（默认「水贴」；水贴内容是自动生成的，不是"点出来"的） */
type IdeaTab = 'idea' | 'hot' | 'trend';

/** 按风格把候选分组（保持首次出现的顺序），同风格多条合并进一张卡。仅供回复模式使用 */
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
  const [mode, setMode] = useState<CopilotMode>('reply');
  // mode 同时存 ref：runGenerate 读 ref 而不是 state，引用才能保持稳定
  // （否则切模式会重建 runGenerate → detector effect 重跑 → 初始识别又把模式改回「回复」）
  const modeRef = useRef<CopilotMode>('reply');
  // tweet 同时存 ref：焦点监听要判断「是否在详情页/回复弹窗」来避免抢回复模式的面板
  const tweetRef = useRef<TweetContext | null>(null);
  // 记录当前聚焦的主发帖框元素，供 focusout 判断「是否从发帖框移开」
  const postComposerFocusedRef = useRef<HTMLElement | null>(null);
  // 最近一次指针按下是否落在我们面板里：点面板内**不可聚焦**的区域（卡片正文、空白）时，
  // 浏览器会把焦点先退回 body，focusout 的 relatedTarget 变成 null，只靠焦点判断会误关面板
  const pointerInPanelRef = useRef(false);
  // 水贴是否已自动尝试过生成：失败后不再自动重试（否则 effect 会反复触发），「换一批」可手动重来
  const ideaAttemptedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  /** 当前在跑的是哪一路：'idea' = 后台自动抽「随便聊聊」，'main' = 用户主动点生成。
   *  只有 'main' 才在按钮上转圈计时——自动抽灵感不该抢「生成帖子」的状态。 */
  const [genSource, setGenSource] = useState<'main' | 'idea' | null>(null);
  // Post V1「灵感来源」区：当前 tab / 水贴三件套 / 列表数据 / 已选中的选题
  const [ideaTab, setIdeaTab] = useState<IdeaTab>('idea');
  // 水贴三件套独立存放：它是"灵感引子"，不该被「生成帖子」的候选挤掉
  const [ideaItems, setIdeaItems] = useState<ReplyCandidate[]>([]);
  const [filledIdeaId, setFilledIdeaId] = useState<string | null>(null);
  const [hotTweets, setHotTweets] = useState<TweetContext[]>([]);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [ideaCollapsed, setIdeaCollapsed] = useState(false);
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
  const intentRef = useRef<HTMLTextAreaElement | null>(null);
  // 本次会话内用户点过「显示」的内容，不再自动隐藏
  const restoredRef = useRef<Set<string>>(new Set());
  const cacheRef = useRef<Map<string, ReplyCandidate[]>>(new Map());
  // 生成序号：生成过程中切换 Tweet 时，旧结果作废，避免错挂到新 Tweet
  const genSeqRef = useRef(0);
  // 当前流式生成的长连接（取消/切帖时断开）
  const activePortRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  // 自动生成开关（设置页可关，改动即时生效）
  const autoGenerateRef = useRef(DEFAULT_UI_CONFIG.autoGenerate);
  const uiConfigRef = useRef<UIConfig>(normalizeUIConfig());

  // 缓存键：模式 / Tweet / 意图 / 选题 / 来源 都要区分
  // （回复结果与发帖草稿不能混；换了选题、或走「随手发」也不能命中上一份）
  const cacheKey = (m: CopilotMode, id?: string, intentText = '', topicText = '', tag = '') =>
    `${m}::${id ?? 'no-id'}::${intentText.trim()}::${topicText}::${tag}`;

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

  const applyMode = useCallback((next: CopilotMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  // 生成候选（流式：候选一到就先渲染；手动与自动触发共用；回复 / 发帖两种模式）
  const runGenerate = useCallback(
    async (
      target: TweetContext | null,
      auto: boolean,
      intentText = '',
      /** 'idea' = 面板上的「随手发」：三件套成品句，忽略选题与页面语境 */
      source?: 'idea'
    ) => {
      const cleanIntent = intentText.trim();
      const currentMode = modeRef.current;
      // 选题 chip 已废弃：点灵感直接填进输入框（intent），不再单独传 topic
      const topic = '';
      // 缓存键带上模式：同一条推文的回复结果与发帖草稿不能混
      const key = cacheKey(currentMode, target?.id, cleanIntent, topic, source ?? '');

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
      setGenSource(source === 'idea' ? 'idea' : 'main');
      setError(undefined);
      // 水贴的结果写进独立一栏，不占用「生成帖子」的候选位
      const writeResult = source === 'idea' ? setIdeaItems : setReplies;
      if (auto)
        setToast(currentMode === 'post' ? '正在为你起草帖子……' : '检测到新 Tweet，正在自动生成回复……');
      else if (source === 'idea') setToast('正在想几个能聊的话题……');

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
          writeResult(msg.replies);
        } else if (msg.type === 'done' && Array.isArray(msg.replies)) {
          settled = true;
          activePortRef.current = null;
          writeResult(msg.replies);
          // 水贴不进缓存："沿用已有的"靠 ideaItems 是否为空判断，不需要另存一份
          if (source !== 'idea') cacheRef.current.set(key, msg.replies);
          if (msg.timing) setTiming(msg.timing);
          if (auto) setToast(currentMode === 'post' ? '帖子草稿已生成' : '回复已生成');
          // 发帖：出结果后把灵感区收成一行「‹ 换个思路」，把空间让给候选
          if (currentMode === 'post' && source !== 'idea') setIdeaCollapsed(true);
          else if (source === 'idea') setToast('已生成 3 条，点一条直接填入');
          setGenerating(false);
          setGenSource(null);
          port.disconnect();
        } else if (msg.type === 'error') {
          settled = true;
          activePortRef.current = null;
          setError(friendlyError(new Error(msg.message ?? '')));
          setGenerating(false);
          setGenSource(null);
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        if (settled || seq !== genSeqRef.current) return;
        // 连接意外中断（如 Service Worker 被回收）
        activePortRef.current = null;
        setGenerating(false);
        setGenSource(null);
        setError('生成中断，请重试。');
      });

      const options: Record<string, unknown> = {
        mode: currentMode,
        intent: cleanIntent || undefined,
      };
      if (source === 'idea') {
        // 随手发：三件套成品句，不带任何页面语境
        options.source = 'idea';
      } else if (currentMode === 'post') {
        // 发帖模式额外带上时间线语境（当前页面互动最高的几条）
        options.contextTweets = collectTimelineTweets(5);
        if (topic) options.topic = topic;
      }
      port.postMessage({ tweet: target, options });
    },
    []
  );

  // 取消在途生成（关闭 Modal / 离开 Tweet 时调用）
  const cancelGeneration = useCallback(() => {
    genSeqRef.current++;
    activePortRef.current?.disconnect();
    activePortRef.current = null;
    setGenerating(false);
    setGenSource(null);
  }, []);

  // Tweet 切换：自动弹出 Panel + 自动生成（缓存命中则直接展示，不重复请求）
  useEffect(() => {
    const detector = new TweetDetector();
    const unobserve = detector.observe((t) => {
      tweetRef.current = t;
      setTweet(t);
      setError(undefined);
      setToast(undefined);
      setFilledId(null);
      setIntent('');
      setTiming(undefined);
      setProgress(undefined);
      // 换帖 / 离开推文：回到未生成状态，灵感区重新展开
      setIdeaCollapsed(false);
      if (!t) {
        // Modal 关闭 / 离开 Tweet：取消在途请求，收起 Panel
        cancelGeneration();
        setReplies([]);
        setOpen(false);
        // 时间线上没有具体推文时，面板默认进发帖模式
        applyMode('post');
        return;
      }
      applyMode('reply');
      const cached = cacheRef.current.get(cacheKey('reply', t.id, ''));
      setReplies(cached ?? []);
      setOpen(true);
      // 自动生成关闭时只弹出面板，等用户手动点「生成回复」
      if (!cached && autoGenerateRef.current) {
        void runGenerate(t, true);
      }
    });
    return unobserve;
  }, [runGenerate, cancelGeneration, applyMode]);

  // 发帖入口：聚焦主发帖框 → 自动弹出面板（发帖模式，不自动生成）；离开发帖框/面板且不进面板/发帖框 → 收起。
  // 贴合用户意图：点开输入框才出面板，移开或关闭弹窗就当"不想发了"。详情页/回复弹窗（tweetRef 有值）下不自动开关。
  useEffect(() => {
    // 节点是否在我们自己的 UI（shadow 面板）里。
    // ⚠️ 不能用 getRootNode() instanceof ShadowRoot 判断 host——host 的 root 是 document，
    // 那样 isOurs 恒为 false，「焦点进面板」的判断会一直失效，点哪儿面板都会被误关。
    // 直接拿 host 引用做 contains（contains 会穿透 shadow DOM，覆盖 host 本身与内部所有节点）。
    const isOurs = (node: EventTarget | null): boolean => {
      const host = document.querySelector('x-copilot-root');
      return !!host && node instanceof Node && host.contains(node);
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element | null;
      if (!el || tweetRef.current) return; // 详情页/回复弹窗不抢回复模式
      const composer = findPostComposer();
      if (composer && (composer === el || composer.contains(el))) {
        postComposerFocusedRef.current = composer;
        applyMode('post');
        setOpen(true);
      }
    };
    // 指针按下时先记一笔「点在哪」：只靠 focusout 的 relatedTarget 判断会误关面板
    const onPointerDown = (e: Event) => {
      const ev = e as MouseEvent;
      const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
      pointerInPanelRef.current = isOurs(ev.target) || path.some((n) => isOurs(n as EventTarget));
      // 只在本次事件循环内有效，别影响之后的键盘操作
      setTimeout(() => {
        pointerInPanelRef.current = false;
      }, 0);
    };
    const onFocusOut = (e: FocusEvent) => {
      const el = e.target as Element | null;
      if (!el || tweetRef.current) return; // 详情页/回复弹窗不自动关
      const leavingPost =
        postComposerFocusedRef.current &&
        (postComposerFocusedRef.current === el || postComposerFocusedRef.current.contains(el));
      const leavingOurs = isOurs(el);
      if (!leavingPost && !leavingOurs) return; // 不是从发帖框/面板移开
      const related = e.relatedTarget as Element | null;
      // 焦点只是失焦到 body / null（典型：点「生成帖子」后按钮变 disabled 被浏览器强制失焦），
      // 这不是"点了页面别处"，面板必须保持展开 —— 否则刚发起生成面板就没了
      if (!related || related === document.body) return;
      const goingPost = (() => {
        const c = findPostComposer();
        return !!c && (c === related || c.contains(related));
      })();
      // 这一下是点在面板里（按钮、卡片、空白都算）→ 保持展开，别把面板关在 click 之前
      if (pointerInPanelRef.current) return;
      if (goingPost || isOurs(related)) return; // 焦点去了发帖框或面板内 → 保持
      postComposerFocusedRef.current = null;
      setOpen(false);
    };
    document.body.addEventListener('focusin', onFocusIn, true);
    document.body.addEventListener('focusout', onFocusOut, true);
    document.body.addEventListener('mousedown', onPointerDown, true);
    return () => {
      document.body.removeEventListener('focusin', onFocusIn, true);
      document.body.removeEventListener('focusout', onFocusOut, true);
      document.body.removeEventListener('mousedown', onPointerDown, true);
    };
  }, [applyMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  // 意图输入框高度随内容增长。放在 effect 里而不是只靠 onChange：
  // 切换模式 / 重新挂载时已有的长文本也要立刻撑开，不能被压回一行
  useEffect(() => {
    const el = intentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }, [intent, mode]);

  // 生成中自行走秒：即使服务端长时间没有任何分片，界面也在动，不会看着像卡死
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - genStartRef.current), 200);
    return () => clearInterval(timer);
  }, [generating]);

  /** M0 Spike（Phase 2）：验证主发帖框能否被找到并写入，且 X 认账（Post 按钮激活） */
  const spikePostComposer = useCallback(() => {
    const composer = findPostComposer();
    if (!composer) {
      setToast('Spike：未找到主发帖框');
      console.debug('[X Copilot] post composer spike: not found');
      return;
    }
    const before = isPostButtonEnabled();
    const filled = fillComposer(composer, POST_SPIKE_TEXT);

    // X 需要一帧来刷新按钮状态
    setTimeout(() => {
      const after = isPostButtonEnabled();
      console.debug('[X Copilot] post composer spike', {
        testId: composer.getAttribute('data-testid'),
        ariaLabel: composer.getAttribute('aria-label'),
        filled,
        postButtonBefore: before,
        postButtonAfter: after,
      });
      setToast(
        filled
          ? after === true
            ? 'Spike：已填入，Post 按钮已激活'
            : after === false
              ? 'Spike：文字进去了，但 Post 按钮仍禁用'
              : 'Spike：已填入（未找到 Post 按钮）'
          : 'Spike：填入失败'
      );
    }, 300);
  }, []);

  /** 切换模式：清掉上一模式的结果，避免回复候选与发帖草稿混在一起 */
  const changeMode = useCallback(
    (next: CopilotMode) => {
      if (next === modeRef.current) return;
      // 详情页 / 回复弹窗（已识别到具体推文）暂不支持发帖：直接无反应
      if (next === 'post' && tweet) return;
      applyMode(next);
      setReplies([]);
      setFilledId(null);
      setError(undefined);
      setTiming(undefined);
      setProgress(undefined);
    },
    [applyMode, tweet]
  );

  /** 点选一条灵感 → 填进输入框（不直接生成、不跳过输入框）。可反复点其他条覆盖 */
  const pickIdeaText = useCallback((text: string) => {
    setIntent(text);
    intentRef.current?.focus();
  }, []);

  /** 生成 / 重抽水贴三件套（顶级认知 / 冷知识 / 扎心真相 各一条，走内置 prompt） */
  const loadIdeas = useCallback(() => {
    // 详情页 / 回复弹窗（有具体推文）不做发帖，跟「发帖」tab 的置灰口径一致
    if (tweetRef.current) return;
    if (modeRef.current !== 'post') applyMode('post');
    void runGenerate(null, false, '', 'idea');
  }, [runGenerate, applyMode]);

  /** 「换一批」：三条同时重抽，仍然各来一条（不会同类堆叠） */
  const reloadIdeas = useCallback(() => {
    if (generating) return;
    setFilledIdeaId(null);
    loadIdeas();
  }, [generating, loadIdeas]);

  /** 切到「Feed热帖」：扫当前已渲染的帖子，不滚动加载 */
  const selectHot = useCallback(() => {
    setIdeaTab('hot');
    setIntent('');
    const list = collectTimelineTweets(5);
    setHotTweets(list);
    if (list.length === 0) setToast('当前页面没扫到帖子，往下滚一点再试');
  }, []);

  /** 切到「热点」：读右侧栏已渲染的话题 */
  const selectTrends = useCallback(() => {
    setIdeaTab('trend');
    setIntent('');
    const list = collectTrends(10);
    setTrends(list);
    if (list.length === 0) setToast('没读到趋势栏，把浏览器窗口拉宽一点再试');
  }, []);

  /** 点水贴里的一条 → 填进面板输入框（列表保持不动，可反复点其他两条覆盖） */
  const useIdea = useCallback((item: ReplyCandidate) => {
    setIntent(item.text);
    setFilledIdeaId(item.id);
  }, []);

  // 打开面板 / 切回「水贴」时，若还没有三件套就自动生成一批；
  // 已有则沿用（同一次会话反复开关面板不重复发请求），只有点「换一批」才重抽。
  useEffect(() => {
    if (!open || mode !== 'post' || ideaTab !== 'idea') return;
    if (ideaItems.length > 0 || generating) return;
    // 已经自动试过一次就不再试：生成失败时 generating 变回 false 会反复触发，
    // 变成对着同一个错误打转。用户想重来可以点「换一批」。
    if (ideaAttemptedRef.current) return;
    ideaAttemptedRef.current = true;
    loadIdeas();
  }, [open, mode, ideaTab, ideaItems.length, generating, loadIdeas]);

  /** 把某条内容加入「永远隐藏此类」 */
  const rememberSignature = useCallback(async (sig: string) => {
    if (!sig) return;
    try {
      const res = await browser.storage.local.get(UI_CONFIG_STORAGE_KEY);
      const next = normalizeUIConfig(res[UI_CONFIG_STORAGE_KEY] as Partial<UIConfig> | undefined);
      if (next.cleaner.alwaysHideSignatures.includes(sig)) return;
      next.cleaner.alwaysHideSignatures.push(sig);
      uiConfigRef.current = next;
      await browser.storage.local.set({ [UI_CONFIG_STORAGE_KEY]: next });
    } catch {
      /* 存储失败不影响使用 */
    }
  }, []);

  /** 扫描当前页面的回复并折叠命中的（返回本次新隐藏的条数） */
  const scanReplies = useCallback(() => {
    const cfg = uiConfigRef.current.cleaner;
    if (!cfg.enabled) return 0;

    const entries = collectReplyTweets(tweet?.id);
    if (entries.length === 0) return 0;

    const all = entries.map((e) => e.tweet);
    let hidden = 0;
    entries.forEach((entry) => {
      const sig = signature(entry.tweet.text);
      if (sig && restoredRef.current.has(sig)) return;
      const verdict = classifyTweet(entry.tweet, all, cfg);
      if (!verdict) return;
      const ok = hideTweet(entry.el, verdict, {
        onShow: () => {
          if (sig) restoredRef.current.add(sig);
        },
        onAlways: () => void rememberSignature(sig),
      });
      if (ok) hidden++;
    });

    if (hidden > 0) {
      const next = normalizeUIConfig({ ...uiConfigRef.current, cleaner: { ...cfg, hiddenCount: cfg.hiddenCount + hidden } });
      uiConfigRef.current = next;
      void browser.storage.local.set({ [UI_CONFIG_STORAGE_KEY]: next }).catch(() => {});
    }
    return hidden;
  }, [tweet, rememberSignature]);

  /** 「🛡 清理」按钮：清掉已有折叠后按当前设置重扫一遍 */
  const runClean = useCallback(() => {
    const cfg = uiConfigRef.current.cleaner;
    if (!cfg.enabled) {
      setToast('评论清理已关闭，可在设置里打开');
      return;
    }
    resetAllHidden();
    const hidden = scanReplies();
    setToast(hidden > 0 ? `已隐藏 ${hidden} 条垃圾评论` : '没有发现需要清理的评论');
  }, [scanReplies]);

  // 评论清理：切换帖子后延迟跑一次（等回复渲染出来）—— 当前已暂停（CLEAN_AUTO_ENABLED=false）
  useEffect(() => {
    if (!CLEAN_AUTO_ENABLED) return;
    const timer = setTimeout(() => void scanReplies(), 900);
    return () => clearTimeout(timer);
  }, [tweet, scanReplies]);

  // 评论清理：评论区向下加载 / DOM 变化时增量重扫（折叠本身也会触发，靠幂等标记兜住）—— 当前已暂停
  useEffect(() => {
    if (!CLEAN_AUTO_ENABLED) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void scanReplies(), 1200);
    };
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [scanReplies]);

  const openSettings = useCallback(async () => {
    try {
      await browser.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    } catch {
      setToast('无法打开设置页，请从 chrome://extensions 找到 X Copilot → 详情 → 扩展程序选项。');
    }
  }, []);

  const fill = useCallback(
    async (candidate: ReplyCandidate) => {
      // 发帖模式填主发帖框，回复模式填回复框
      const composer = mode === 'post' ? findPostComposer() : findReplyComposer();
      if (!composer) {
        setToast(
          mode === 'post'
            ? '未找到发帖框，请先点开首页的发帖框。'
            : '未找到回复输入框，请先点击「回复」。'
        );
        return;
      }
      const ok =
        mode === 'post'
          ? fillComposer(composer, candidate.text)
          : fillReplyComposer(composer, candidate.text);
      if (ok) {
        setToast('已填入，请检查后自行发送。');
        // 替换语义：只标记最新填入的一条，上一条自动恢复
        setFilledId(candidate.id);
      } else {
        setToast('填入失败，请手动复制粘贴。');
      }
    },
    [mode]
  );

  return (
    <>
      <FloatingButton open={open} onToggle={() => setOpen((v) => !v)} />
      <Panel
        open={open}
        onClose={() => setOpen(false)}
        onOpenSettings={openSettings}
        mode={mode}
        onModeChange={changeMode}
        postDisabled={!!tweet}
        onClean={CLEAN_AUTO_ENABLED ? runClean : undefined}
      >
        {tweet ? (
          <div className="xc-tweet-card">
            {mode === 'post' && <div className="xc-tweet-tag">灵感来源（不会回复它）</div>}
            <div className="xc-tweet-author">
              {tweet.author ?? '未知用户'} {tweet.authorHandle ? `· ${tweet.authorHandle}` : ''}
            </div>
            <div className="xc-tweet-text">
              {tweet.text || '（这条帖子没有文字，只有图片）'}
            </div>
          </div>
        ) : mode === 'reply' ? (
          <div className="xc-empty">
            暂时没有识别到当前 Tweet。
            <br />
            打开一条 Tweet 详情页，或切到「发帖」写自己的帖子。
          </div>
        ) : null}


        {mode === 'post' &&
          (ideaCollapsed ? (
            <button
              type="button"
              className="xc-idea-back"
              onClick={() => setIdeaCollapsed(false)}
            >
              ‹ 换个思路（重新选灵感）
            </button>
          ) : (
          <>
            <div className="xc-idea-rail">
              <div className="xc-idea-head">
                <span className="xc-idea-title">灵感来源</span>
                {generating && genSource === 'idea' && (
                  <span className="xc-idea-busy">
                    <span className="xc-spin dark" />
                    {elapsedMs > 800 ? `${(elapsedMs / 1000).toFixed(1)}s` : '正在想……'}
                  </span>
                )}
              </div>
              <div className="xc-idea-bar">
                <button
                  type="button"
                  className={'xc-idea-chip' + (ideaTab === 'idea' ? ' active' : '')}
                  onClick={() => {
                    setIdeaTab('idea');
                    setIntent('');
                  }}
                  title="顶级认知 / 冷知识 / 扎心真相，各来一条"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="4" />
                    <circle cx="12" cy="12" r="2.4" />
                  </svg>
                  <span>随便聊聊</span>
                </button>
                <button
                  type="button"
                  className={'xc-idea-chip' + (ideaTab === 'hot' ? ' active' : '')}
                  onClick={selectHot}
                  title="当前页面上互动最高的几条帖子"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8.5V12l2.6 1.6" />
                  </svg>
                  <span>Feed热帖</span>
                </button>
                <button
                  type="button"
                  className={'xc-idea-chip' + (ideaTab === 'trend' ? ' active' : '')}
                  onClick={selectTrends}
                  title="X 右侧栏「正在流行」里的话题"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="4 16 9.5 10.5 13 14 20 7" />
                    <polyline points="14.5 7 20 7 20 12.5" />
                  </svg>
                  <span>热点</span>
                </button>
                {ideaTab === 'idea' && (
                  <button
                    type="button"
                    className="xc-idea-refresh"
                    onClick={reloadIdeas}
                    disabled={generating}
                    title="三条同时重新抽（仍然各来一条）"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3.2 12a8.8 8.8 0 1 0 2.6-6.2" />
                      <path d="M3 4v5h5" />
                    </svg>
                    <span>换一批</span>
                  </button>
                )}
              </div>
            </div>

            {ideaTab === 'idea' && ideaItems.length === 0 && generating && genSource === 'idea' && (
              <div className="xc-idea-loading">
                <span className="xc-spin dark" />
                正在想话题 {elapsedMs > 800 ? `${(elapsedMs / 1000).toFixed(1)}s` : '……'}
              </div>
            )}

            {ideaTab === 'idea' && ideaItems.length > 0 && (
              <div className="xc-cand-list">
                {ideaItems.map((r) => (
                  <CandidateRow
                    key={r.id}
                    candidate={r}
                    filled={filledIdeaId === r.id}
                    onFill={useIdea}
                    hint="点这一行填进上方的输入框"
                  />
                ))}
              </div>
            )}

            {ideaTab === 'hot' && (
              <div className="xc-idea-list">
                {hotTweets.map((t, i) => (
                  <button
                    key={t.id ?? i}
                    type="button"
                    className="xc-idea-item"
                    onClick={() => pickIdeaText(t.text.replace(/\s+/g, ' ').trim().slice(0, 160))}
                  >
                    <div className="xc-idea-item-meta">
                      {t.authorHandle ?? t.author ?? '未知'} · ♥ {t.likeCount ?? 0} · 回复{' '}
                      {t.replyCount ?? 0}
                    </div>
                    <div className="xc-idea-item-text">{t.text.slice(0, 90)}</div>
                  </button>
                ))}
              </div>
            )}

            {ideaTab === 'trend' && (
              <div className="xc-idea-list">
                {trends.map((t) => (
                  <button
                    key={t.topic}
                    type="button"
                    className="xc-trend-item"
                    onClick={() => pickIdeaText(t.topic)}
                  >
                    <span className="xc-trend-rank">{t.rank}</span>
                    <span className="xc-trend-topic">{t.topic}</span>
                    {t.category ? <span className="xc-trend-cat">{t.category}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </>
          ))}
        {(tweet || mode === 'post') && (
          <textarea
            ref={intentRef}
            className="xc-intent"
            rows={1}
            value={intent}
            maxLength={300}
            placeholder={mode === 'post' ? '想发点什么？（可选，一两句话）' : '想说什么？（可选，一句话）'}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={(e) => {
              // Enter 直接生成；Shift+Enter 换行
              if (e.key === 'Enter' && !e.shiftKey && !generating && (tweet || mode === 'post')) {
                e.preventDefault();
                void runGenerate(tweet, false, intent);
              }
            }}
          />
        )}
        <button
          className="xc-generate-btn"
          onClick={() => runGenerate(tweet, false, intent)}
          disabled={
            // 后台抽「随便聊聊」不算：那时按钮不该置灰，用户随时可以自己发起生成
            (generating && genSource !== 'idea') ||
            (mode === 'reply' && !tweet) ||
            // 发帖模式：输入框为空就没有"要说什么"，禁用（与回复模式的 disabled 样式一致）
            (mode === 'post' && !intent.trim())
          }
        >
          {generating && genSource !== 'idea' ? (
            <>
              <span className="xc-spin" />
              正在生成 {elapsedMs > 800 ? `${(elapsedMs / 1000).toFixed(1)}s` : '……'}
            </>
          ) : mode === 'post' ? (
            replies.length > 0 ? (
              '重新生成'
            ) : (
              '生成帖子'
            )
          ) : intent.trim() ? (
            '按这个想法生成'
          ) : replies.length > 0 ? (
            '重新生成'
          ) : (
            '生成回复'
          )}
        </button>


        {error && <div className="xc-error">{error}</div>}

        {debugTiming && generating && genSource !== 'idea' && (
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

        {debugTiming && (
          <button className="xc-spike-btn" onClick={spikePostComposer}>
            Spike：测试填入主发帖框
          </button>
        )}

        {/* 两种模式共用同一套候选展示：按风格分组的黑边卡（2026-09-15 用户决定统一用卡片） */}
        {replies.length > 0 && (
          <>
            {groupByStyle(replies).map((group) => (
              <ReplyCard
                key={group.style}
                style={group.style}
                items={group.items}
                filledId={filledId}
                onFill={fill}
              />
            ))}
          </>
        )}

        {toast && <div className="xc-toast">{toast}</div>}
      </Panel>
    </>
  );
}
