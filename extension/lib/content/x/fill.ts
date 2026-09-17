/**
 * 把文本写进 X 的 composer（回复框 / 主发帖框，替换语义）。
 *
 * X 的 composer 是 DraftJS（2026-09-16 probe 实测确认）。
 * EditorState 是唯一真相，不监听 DOM 变化。
 *
 * ⚠️ 回复框与发帖框是两个不同的编辑器场景，分开实现（历史教训：
 *    用同一套写入方式同时改两边，会修好一边、弄坏另一边）：
 *   - fillReplyComposer：先同步清空再写入（69c7111 的可工作结构，回复填入此前一直正常）
 *   - fillComposer：selectAll + 写入一步替换（2e67b56 起，发帖框行为正常）
 *
 * ⚠️ 清空的 selectAll + delete 必须**同帧连续执行**（中间不能 await）：
 *    加了 await 会让浏览器在两帧之间把「全选高亮」画出来 —— 看起来就是闪一下。
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */
import { isPostButtonEnabled } from './composer-detector';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── 公共：验收工具 ──────────────────────────────────────────────────────────

const ACCEPT_POLL_MS = 60;
const ACCEPT_TIMEOUT_MS = 1200;

/**
 * 轮询等待编辑器认账（按钮点亮）。
 * DraftJS 的 onChange → React state → 按钮 disabled 是异步链，
 * 同步读到的必然是写入前的旧值。
 */
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

/** 忽略空白差异的文字比对（<br> 不产生字符，严格等值会把填好的判失败） */
function sameText(el: HTMLElement, expected: string): boolean {
  const squash = (s: string) => s.replace(/[\s\u200b]+/g, '');
  return squash(el.textContent ?? '') === squash(expected);
}

/** 文本节点里是否残留裸 \n（＝只靠 CSS 渲染出来的"假换行"） */
function hasRawNewlineInTextNodes(el: HTMLElement): boolean {
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').includes('\n');
    return Array.from(node.childNodes).some(walk);
  };
  return walk(el);
}

/**
 * 换行是否是编辑器认可的换行。
 * 裸 \n 还在文本节点里 → 先否决（提交时会被丢掉）。
 * 真换行 = 没有裸 \n 残留 且 有结构承载（<br> 或块级元素）。
 */
function newlinesAreReal(el: HTMLElement, expected: string): boolean {
  const want = (expected.match(/\n/g) ?? []).length;
  if (want === 0) return true;
  if (hasRawNewlineInTextNodes(el)) return false;
  return (
    el.querySelectorAll('br').length > 0 ||
    [...el.children].some((c) => c.tagName === 'DIV' || c.tagName === 'P')
  );
}

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

export type FillOutcome =
  /** 编辑器已认账（退格可删、换行能发出去） */
  | { kind: 'filled'; strategy: string }
  /** 文字写不进编辑器状态，已把文本放进剪贴板，等用户 Ctrl+V */
  | { kind: 'copied' }
  /** 连剪贴板也失败 */
  | { kind: 'failed' };

// ─── 回复框 ──────────────────────────────────────────────────────────────────

/**
 * 同步清空：selectAll + delete 连做两遍，**中间无 await**。
 * - 必须显式清空：selectAll 不会同步 DraftJS 的 EditorState.selection，
 *   不清空直接写入会在编辑器状态里「追加」而不是替换（字符计数累计）。
 * - 必须同帧：加 await 会让「全选高亮」被绘制出来，视觉上就是闪一下。
 * - 两遍：DraftJS 状态更新滞后于 DOM，一遍只清 DOM。
 */
function clearComposerSync(el: HTMLElement): void {
  el.focus();
  if ((el.textContent ?? '').trim() === '') return;
  for (let i = 0; i < 2; i++) {
    try {
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
    } catch {
      /* 忽略，写入后的校验会兜底 */
    }
  }
}

/** 合成 paste 事件（走编辑器自己的粘贴处理，换行会成为编辑器认可的换行节点） */
function pasteOnce(el: HTMLElement, text: string): void {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    // 有的 Chrome 会忽略构造函数里的 clipboardData（读出来是 null）→ 手动挂一次
    if (!ev.clipboardData) {
      Object.defineProperty(ev, 'clipboardData', { value: dt, configurable: true });
    }
    el.dispatchEvent(ev);
  } catch {
    /* 交给下一个策略 */
  }
}

/** 全选 + 一次性 insertText（走浏览器原生输入路径） */
function insertTextOnce(el: HTMLElement, text: string): void {
  el.focus();
  try {
    document.execCommand('selectAll', false);
  } catch {
    /* 继续，insertText 会替换当前选区 */
  }
  document.execCommand('insertText', false, text);
}

/** 逐行写入，行间用 insertLineBreak（编辑器原生换行节点） */
function insertLineByLine(el: HTMLElement, text: string): void {
  const lines = text.split('\n');
  el.focus();
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) document.execCommand('insertLineBreak');
    if (lines[i]) document.execCommand('insertText', false, lines[i]);
  }
}

const REPLY_STRATEGIES: { name: string; run: (el: HTMLElement, text: string) => void }[] = [
  { name: '1-合成paste', run: pasteOnce },
  { name: '2-insertText', run: insertTextOnce },
  { name: '3-逐行+insertLineBreak', run: insertLineByLine },
];

export async function fillReplyComposer(
  el: HTMLElement,
  text: string
): Promise<FillOutcome> {
  const target = text.trim();

  for (const strategy of REPLY_STRATEGIES) {
    clearComposerSync(el);
    // 清空后按钮应回到 disabled；若仍可用说明判据不可靠，本轮改为只看文字
    const clearedAccepted = await waitAccepted(el, 400);

    try {
      strategy.run(el, target);
    } catch {
      /* 交给下一个策略 */
    }

    const accepted = await waitAccepted(el);
    const textOk = sameText(el, target);
    const newlineOk = newlinesAreReal(el, target);

    const reliable = clearedAccepted === false;
    const passed = textOk && newlineOk && (reliable ? accepted === true : accepted !== false);

    console.debug('[x-copilot:fill]', `回复-${strategy.name}`, {
      策略被认账: passed,
      文字对得上: textOk,
      换行是真的: newlineOk,
      清空后按钮可用: clearedAccepted,
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

// ─── 发帖框 ──────────────────────────────────────────────────────────────────

/** selectAll + 合成 paste（替换语义） */
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

/** selectAll + execCommand('insertText')（替换语义） */
async function insertTextReplace(el: HTMLElement, text: string): Promise<void> {
  el.focus();
  await sleep(60);
  try { document.execCommand('selectAll', false); } catch { /* ignore */ }
  await sleep(60);
  document.execCommand('insertText', false, text);
}

/** selectAll + 逐行 insertText/insertLineBreak（兜底） */
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

type PostStrategy = { name: string; run: (el: HTMLElement, text: string) => Promise<void> };

const POST_STRATEGIES_MULTILINE: PostStrategy[] = [
  { name: '1-paste替换', run: pasteReplace },
  { name: '2-insertText替换', run: insertTextReplace },
  { name: '3-逐行替换', run: lineByLineReplace },
];
const POST_STRATEGIES_SINGLELINE: PostStrategy[] = [
  { name: '1-insertText替换', run: insertTextReplace },
  { name: '2-paste替换', run: pasteReplace },
];

export async function fillComposer(
  el: HTMLElement,
  text: string
): Promise<FillOutcome> {
  const target = text.trim();
  const strategies = target.includes('\n')
    ? POST_STRATEGIES_MULTILINE
    : POST_STRATEGIES_SINGLELINE;

  // 记录写入前的按钮状态，用于判断验收是否可靠
  const beforeEnabled = isPostButtonEnabled(el);

  for (const strategy of strategies) {
    try {
      await strategy.run(el, target);
    } catch {
      /* 交给下一个策略 */
    }

    const accepted = await waitAccepted(el);
    const textOk = sameText(el, target);
    const newlineOk = newlinesAreReal(el, target);

    const reliable = beforeEnabled === false;
    const passed = textOk && newlineOk && (reliable ? accepted === true : accepted !== false);

    console.debug('[x-copilot:fill]', `发帖-${strategy.name}`, {
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
