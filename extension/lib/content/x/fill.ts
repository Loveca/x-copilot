/**
 * 把文本写进 X 的 composer（回复框 / 主发帖框，替换语义）。
 *
 * ⚠️ 核心认知：**X 的 composer 是 DraftJS**（2026-09-16 用 probe 在 x.com 实测确认：
 *    `{Lexical: false, DraftJS: true, ProseMirror: false}`）。
 *    DraftJS 的 `EditorState` 是唯一真相，而且它**不监听 DOM 变化**：
 *    - 只把文字塞进 DOM（直接改 innerHTML / 不走编辑器的写入）→ 看着有字
 *      （CSS `white-space: pre-wrap` 把裸 `\n` 渲染成换行），但：
 *      · **退格删不掉**（S2）—— Backspace 走 EditorState，状态里没这段文字，无事可删
 *      · **提交时按 EditorState 序列化 → 换行全丢**（S1）——编辑器状态里根本没有这段文字
 *
 * 「成功」= 文字进 DOM + 换行由编辑器节点（`<br>` / 块级元素）承载；
 * 按钮（`isPostButtonEnabled`）作为「X 认账」的代理判据，只用于宽限等待。
 *
 * ⚠️ 2026-09-17 二次调整（消除「填入时闪一下」）：
 *   此前每条策略前都先「清空再写入」，且任何一项验收不过就清掉重来 ——
 *   只要第一条策略其实写对了、或框里本来就有旧文案，用户就会看到
 *   「文字出现 → 被清空 → 重新写入」的可见闪动。现在：
 *   - 写入一律用「全选 + 替换」语义（selectAll 后 paste / insertText 直接替换选区），
 *     不再有清空后的空白期；
 *   - 文字与换行结构都已正确时**绝不重写**（按钮判据只触发额外等待，不再销毁重填）。
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */
import { isPostButtonEnabled } from './composer-detector';

/**
 * 候选策略（按"最可能被 DraftJS 认账"排序），见下方各自注释。
 *
 * ⚠️ 2026-09-17 调整（修 S4）：
 *   - **移除「合成 beforeinput」**——DraftJS 的 editOnBeforeInput 收到合成事件后可能只更新
 *     EditorState 而不走完整的 onChange → React → 重渲染链，正是 S4（状态变、界面不刷新）的头号嫌疑。
 *   - **合成 paste 提为首选**——SO 79666573（针对 X 本站）实证：合成 paste 是唯一同时做到
 *     「显示有换行 + 发出去仍有换行」的路径；此前它"失败"多半是旧验收探针取错按钮导致的误判。
 */
const STRATEGIES: { name: string; run: (el: HTMLElement, text: string) => void }[] = [
  { name: '1-合成paste', run: pasteOnce },
  { name: '2-insertText', run: insertTextOnce },
  { name: '3-逐行+insertLineBreak', run: insertLineByLine },
];

/**
 * 等待编辑器认账（按钮点亮）。
 *
 * ⚠️ 必须在写入**之后**轮询等待，不能同步读一次就下结论：
 * DraftJS 的 onChange → React 状态 → 按钮 disabled 属性是一条异步链，
 * 同步读到的必然是写入前的旧值 —— 那会把**已经填好**的结果判成失败，
 * 继续降级到更差的策略（历史上最难查的一个假阴性）。
 */
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
    await new Promise((r) => setTimeout(r, ACCEPT_POLL_MS));
  }
}

/**
 * 内容是否已写入。忽略空白差异：
 * 编辑器真正的换行节点在 textContent 里**不产生** `\n`（`<br>` 不产生字符），
 * 用严格等值比较会把"已经填好"误判成"没填进去"。
 */
function sameText(el: HTMLElement, expected: string): boolean {
  const squash = (s: string) => s.replace(/[\s​]+/g, '');
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
 * 换行是否是**编辑器认可的换行**（对应 S1）。
 * 期望文本里没有换行 → 直接算过。
 *
 * ⚠️ 判定顺序很重要：「裸 `\n` 还在文本节点里」必须**先**作为否决项。
 *    否则「有一个 DIV 装着整段带 `\n` 的文字」会因为"有块级子元素"被判成合格 ——
 *    而那种情况恰恰就是假换行（DraftJS 一个 block 里塞了裸 `\n`，提交时丢换行）。
 * 真换行 = 没有裸 `\n` 残留 **且** 有结构承载（`<br>` 或每个块级元素一行）。
 */
function newlinesAreReal(el: HTMLElement, expected: string): boolean {
  const want = (expected.match(/\n/g) ?? []).length;
  if (want === 0) return true;
  // 裸 \n 还躺在文本节点里 → 假换行，提交时会被丢掉
  if (hasRawNewlineInTextNodes(el)) return false;
  // 没有裸 \n 了，换行必须有结构承载才算数
  return (
    el.querySelectorAll('br').length > 0 ||
    [...el.children].some((c) => c.tagName === 'DIV' || c.tagName === 'P')
  );
}

/**
 * 策略 1：合成 paste 事件（走编辑器自己的粘贴处理，换行会成为编辑器认可的换行节点）。
 *
 * 先 selectAll 再派发 —— **粘贴会替换选中的旧内容**，天然就是「整体替换」语义：
 * 不需要先 delete 清空，也就没有「清空 → 空白期 → 重写」的可见闪动。
 * 空框上 selectAll 无选区，无副作用。
 */
function pasteOnce(el: HTMLElement, text: string): void {
  el.focus();
  try {
    document.execCommand('selectAll', false);
  } catch {
    /* 空框上无选区，无妨 */
  }
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

/** 策略 2：全选 + 一次性 insertText（走浏览器原生输入路径，同样替换选区、无空白期） */
function insertTextOnce(el: HTMLElement, text: string): void {
  el.focus();
  try {
    document.execCommand('selectAll', false);
  } catch {
    /* 继续，insertText 会替换当前选区 */
  }
  document.execCommand('insertText', false, text);
}

/**
 * 策略 3：逐行写入，行间用 insertLineBreak（编辑器原生换行节点）。
 * 这条没有「替换选区」语义，需要先 selectAll + delete 清掉旧内容。
 */
function insertLineByLine(el: HTMLElement, text: string): void {
  const lines = text.split('\n');
  el.focus();
  try {
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
  } catch {
    /* 空框无妨 */
  }
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) document.execCommand('insertLineBreak');
    if (lines[i]) document.execCommand('insertText', false, lines[i]);
  }
}

/** 复制到剪贴板（保证可行的兜底：真实粘贴必然被编辑器认账） */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 剪贴板 API 不可用（权限 / 非安全上下文）→ 退回旧的 execCommand 方案
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

/**
 * 把 text 写进 composer。返回结局，由调用方决定提示文案。
 * 只有「编辑器认账」才算成功；否则退到剪贴板兜底，绝不假装成功。
 */
export async function fillReplyComposer(
  el: HTMLElement,
  text: string
): Promise<FillOutcome> {
  const target = text.trim();
  if (!target) return { kind: 'failed' };

  for (const strategy of STRATEGIES) {
    // 写入前的按钮状态：空框时按钮应为 disabled，它后续亮起才能归因于我们的写入。
    // 有旧文案时按钮本来就可能亮 → 判据不可靠，验收走宽松分支。
    const preAccepted = await waitAccepted(el, 200);

    try {
      strategy.run(el, target);
    } catch {
      /* 交给下一个策略 */
    }

    const accepted = await waitAccepted(el);
    const textOk = sameText(el, target);
    const newlineOk = newlinesAreReal(el, target);
    const reliable = preAccepted === false;
    let passed = textOk && newlineOk && (reliable ? accepted === true : accepted !== false);

    // 宽限：文字与换行结构都已正确、只是按钮还没亮 —— 再等一段，仍不亮也接受。
    // 按钮只是「X 认账」的代理判据；这里的每条写入策略都只能经由编辑器生效
    // （不存在"只进 DOM"的路径），结构正确的换行 + 文字一致已足以保证 S1/S2。
    // ⚠️ 绝不能为此清掉重写 —— 那正是「填入时闪一下」的来源。
    if (!passed && textOk && newlineOk) {
      await waitAccepted(el, 800);
      passed = true;
    }

    console.debug('[x-copilot:fill]', strategy.name, {
      策略被认账: passed,
      文字对得上: textOk,
      换行是真的: newlineOk,
      写入前按钮可用: preAccepted,
      填入后按钮可用: accepted,
      br数: el.querySelectorAll('br').length,
      子元素: [...el.children].map((c) => c.tagName).join(','),
      片段: el.innerHTML.slice(0, 150),
    });

    if (passed) return { kind: 'filled', strategy: strategy.name };
  }

  // 三条策略都没写进去 —— 不假装成功，改用剪贴板兜底
  const copied = await copyToClipboard(target);
  return copied ? { kind: 'copied' } : { kind: 'failed' };
}

/** 同一套写入策略，Phase 2 的主发帖框也用它（命名去掉 reply 限定） */
export { fillReplyComposer as fillComposer };
