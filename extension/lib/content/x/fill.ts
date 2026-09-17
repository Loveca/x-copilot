/**
 * 把文本写进 X 的 composer（回复框 / 主发帖框，替换语义）。
 *
 * X 的 composer 是 DraftJS（2026-09-16 probe 实测确认）。
 * EditorState 是唯一真相，不监听 DOM 变化。
 *
 * 核心思路：**不做"先清空再写入"的两步操作**（那是竞态的根源）。
 * 改为 selectAll + 写入 = 一步替换，等价于用户 Ctrl+A → Ctrl+V / 打字。
 *
 * 策略顺序：
 *   1. selectAll + 合成 paste —— 走 DraftJS 的 handlePastedText，换行处理最好。
 *   2. selectAll + execCommand('insertText') —— 触发原生 beforeinput。
 *   3. selectAll + 逐行 insertText/insertLineBreak —— 兜底。
 *   4. 剪贴板 —— 全部失败时复制到剪贴板让用户手动 Ctrl+V。
 *
 * ⚠️ 每步 DOM 操作之间 await sleep，给 DraftJS 时间处理事件并同步 EditorState。
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */
import { isPostButtonEnabled } from './composer-detector';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── 策略 ────────────────────────────────────────────────────────────────────

/**
 * 策略 1：selectAll + 合成 paste
 * DraftJS 的 handlePastedText 会读取 clipboardData 并正确更新 EditorState，
 * 换行会被处理成编辑器认可的换行节点（<br> / 多 block）。
 * selectAll 让 paste 替换已有内容而不是追加。
 */
async function pasteReplace(el: HTMLElement, text: string): Promise<void> {
  el.focus();
  await sleep(60);
  try { document.execCommand('selectAll', false); } catch { /* ignore */ }
  await sleep(60);
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  const ev = new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  });
  if (!ev.clipboardData) {
    Object.defineProperty(ev, 'clipboardData', { value: dt, configurable: true });
  }
  el.dispatchEvent(ev);
}

/**
 * 策略 2：selectAll + execCommand('insertText')
 * 触发浏览器原生 beforeinput（isTrusted: true），DraftJS 的 editOnBeforeInput
 * 拦截并更新 EditorState。selectAll 让 insertText 替换选区。
 */
async function insertTextReplace(el: HTMLElement, text: string): Promise<void> {
  el.focus();
  await sleep(60);
  try { document.execCommand('selectAll', false); } catch { /* ignore */ }
  await sleep(60);
  document.execCommand('insertText', false, text);
}

/**
 * 策略 3：selectAll + 逐行写入
 * 兜底：先 selectAll 清掉已有内容的选区，第一行 insertText 替换选区，
 * 后续行用 insertLineBreak + insertText 追加。
 */
async function lineByLineReplace(el: HTMLElement, text: string): Promise<void> {
  const lines = text.split('\n');
  el.focus();
  await sleep(60);
  try { document.execCommand('selectAll', false); } catch { /* ignore */ }
  await sleep(60);
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      document.execCommand('insertLineBreak');
      await sleep(30);
    }
    if (lines[i]) {
      document.execCommand('insertText', false, lines[i]);
      await sleep(30);
    }
  }
}

// 有换行 → paste 优先（DraftJS 的 handlePastedText 才能把 \n 正确转成编辑器换行节点）
// 无换行 → insertText 优先（不需要合成事件，更简单可靠）
const STRATEGIES_MULTILINE: { name: string; run: (el: HTMLElement, text: string) => Promise<void> }[] = [
  { name: '1-paste替换', run: pasteReplace },
  { name: '2-insertText替换', run: insertTextReplace },
  { name: '3-逐行替换', run: lineByLineReplace },
];
const STRATEGIES_SINGLELINE: { name: string; run: (el: HTMLElement, text: string) => Promise<void> }[] = [
  { name: '1-insertText替换', run: insertTextReplace },
  { name: '2-paste替换', run: pasteReplace },
];

// ─── 验收 ────────────────────────────────────────────────────────────────────

const ACCEPT_POLL_MS = 60;
const ACCEPT_TIMEOUT_MS = 1200;

async function waitAccepted(
  composer: HTMLElement,
  timeout = ACCEPT_TIMEOUT_MS
): Promise<boolean | null> {
  const deadline = Date.now() + timeout;
  let last: boolean | null = null;
  for (;;) {
    last = isPostButtonEnabled(composer);
    if (last === true) return true;
    if (Date.now() >= deadline) return last;
    await sleep(ACCEPT_POLL_MS);
  }
}

function sameText(el: HTMLElement, expected: string): boolean {
  const squash = (s: string) => s.replace(/[\s\u200b]+/g, '');
  return squash(el.textContent ?? '') === squash(expected);
}

function hasRawNewlineInTextNodes(el: HTMLElement): boolean {
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').includes('\n');
    return Array.from(node.childNodes).some(walk);
  };
  return walk(el);
}

function newlinesAreReal(el: HTMLElement, expected: string): boolean {
  const want = (expected.match(/\n/g) ?? []).length;
  if (want === 0) return true;
  if (hasRawNewlineInTextNodes(el)) return false;
  return (
    el.querySelectorAll('br').length > 0 ||
    [...el.children].some((c) => c.tagName === 'DIV' || c.tagName === 'P')
  );
}

// ─── 剪贴板兜底 ──────────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

export type FillOutcome =
  | { kind: 'filled'; strategy: string }
  | { kind: 'copied' }
  | { kind: 'failed' };

export async function fillReplyComposer(
  el: HTMLElement,
  text: string
): Promise<FillOutcome> {
  const target = text.trim();
  const strategies = target.includes('\n') ? STRATEGIES_MULTILINE : STRATEGIES_SINGLELINE;

  // 记录写入前的按钮状态，用于判断验收是否可靠
  const beforeEnabled = isPostButtonEnabled(el);

  for (const strategy of strategies) {
    try {
      await strategy.run(el, target);
    } catch { /* 交给下一个策略 */ }

    const accepted = await waitAccepted(el);
    const textOk = sameText(el, target);
    const newlineOk = newlinesAreReal(el, target);

    // 写入前按钮是 disabled → 写入后变 enabled 是强信号
    // 写入前按钮已经 enabled（编辑器有旧内容）→ 按钮状态无法区分，退回只看文字
    const reliable = beforeEnabled === false;
    const passed = textOk && newlineOk && (reliable ? accepted === true : accepted !== false);

    console.debug('[x-copilot:fill]', strategy.name, {
      策略被认账: passed,
      文字对得上: textOk,
      换行是真的: newlineOk,
      写入前按钮可用: beforeEnabled,
      填入后按钮可用: accepted,
      br数: el.querySelectorAll('br').length,
      子元素: [...el.children].map((c) => c.tagName).join(','),
      片段: el.innerHTML.slice(0, 150),
    });

    if (passed) return { kind: 'filled', strategy: strategy.name };
  }

  const copied = await copyToClipboard(target);
  return copied ? { kind: 'copied' } : { kind: 'failed' };
}

export { fillReplyComposer as fillComposer };
