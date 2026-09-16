/**
 * 把文本写进 X 的 composer（回复框 / 主发帖框，替换语义）。
 *
 * ⚠️ 核心认知：X 的 composer 是 contenteditable + 富文本编辑器（Lexical / DraftJS 一类），
 *    它维护一份**自己的编辑器状态**，跟 DOM 是两回事：
 *    - 只把文字塞进 DOM（execCommand / 直接改 innerHTML）→ 看着有字，但**退格删不掉**，
 *      而且提交时换行会丢（编辑器状态里其实没有这段文字）。
 *    - 必须让编辑器"认账"。X 自己的判据是 **Post / Reply 按钮从 disabled 变可用**
 *      （`isPostButtonEnabled()`）—— 本文件拿它当每个策略的验收标准。
 *
 * 验收 = 文字对得上（忽略空白差异）**且** 按钮被点亮；拿不到按钮时退回只看文字。
 * 三个策略依次尝试，谁被编辑器认账就用谁；都不认账则保留文字并在 Console 打日志。
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */
import { isPostButtonEnabled } from './composer-detector';

/**
 * 内容是否已写入。忽略空白差异：
 * 编辑器真正的换行节点在 textContent 里**不产生** `\n`（`<br>` 不产生字符），
 * 用严格等值比较会把"已经填好"误判成"没填进去"。
 */
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

/** 编辑器是否认账：X 的 Post / Reply 按钮是否可用。null = 找不到按钮，无法判断 */
function editorAccepted(): boolean | null {
  return isPostButtonEnabled();
}

/** 填充前的清空（只在非空时做；不重复执行，避免把编辑器状态搞乱） */
function clearComposer(el: HTMLElement): void {
  el.focus();
  if ((el.textContent ?? '').trim() === '') return;
  try {
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
  } catch {
    /* 忽略，后面的写入会覆盖选区 */
  }
}

/** 策略 1：全选 + 一次性 insertText（一步替换，不先删） */
function insertAllOnce(el: HTMLElement, text: string): void {
  el.focus();
  try {
    document.execCommand('selectAll', false);
  } catch {
    /* 继续，insertText 会替换当前选区 */
  }
  document.execCommand('insertText', false, text);
}

/** 策略 2：合成 paste 事件（走编辑器自己的粘贴处理，换行会成为编辑器认可的换行节点） */
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

/** 策略 3：逐行写入，行间用 insertLineBreak（编辑器原生换行节点） */
function insertLineByLine(el: HTMLElement, text: string): void {
  const lines = text.split('\n');
  el.focus();
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) document.execCommand('insertLineBreak');
    if (lines[i]) document.execCommand('insertText', false, lines[i]);
  }
}

type Strategy = { name: string; run: (el: HTMLElement, text: string) => void };

const STRATEGIES: Strategy[] = [
  { name: '1-全选+insertText', run: insertAllOnce },
  { name: '2-合成paste', run: pasteOnce },
  { name: '3-逐行+insertLineBreak', run: insertLineByLine },
];

/**
 * 临时诊断：定位「退格删不掉 / 提交后换行消失」到底卡在哪一步。
 * ⚠️ 定位完成后删除本函数与所有调用。
 */
function diagFill(
  el: HTMLElement,
  strategy: string,
  textOk: boolean,
  clearedAccepted: boolean | null,
  accepted: boolean | null
): void {
  console.debug('[x-copilot:fill]', strategy, {
    文字对得上: textOk,
    清空后按钮可用: clearedAccepted,
    填入后按钮可用: accepted,
    文本节点含裸换行: hasRawNewlineInTextNodes(el),
    br数: el.querySelectorAll('br').length,
    子元素: [...el.children].map((c) => c.tagName).join(','),
    文本前60: JSON.stringify((el.textContent ?? '').slice(0, 60)),
    片段: el.innerHTML.slice(0, 150),
  });
}

export function fillReplyComposer(el: HTMLElement, text: string): boolean {
  const target = text.trim();
  let textLandedButNotAccepted = false;

  for (const strategy of STRATEGIES) {
    clearComposer(el);
    const clearedAccepted = editorAccepted();
    try {
      strategy.run(el, target);
    } catch {
      /* 交给下一个策略 */
    }
    const textOk = sameText(el, target);
    const accepted = editorAccepted();
    diagFill(el, strategy.name, textOk, clearedAccepted, accepted);

    if (textOk && accepted !== false) return true;
    if (textOk) textLandedButNotAccepted = true;
  }

  // 三个策略都没被编辑器认账：文字至少进去了，但可能退格删不掉 / 提交丢换行
  return textLandedButNotAccepted;
}

/** 同一套写入策略，Phase 2 的主发帖框也用它（命名去掉 reply 限定） */
export { fillReplyComposer as fillComposer };
