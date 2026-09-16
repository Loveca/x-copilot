/**
 * 把文本写进 X 的 composer（回复框 / 主发帖框，替换语义）。
 *
 * X 的 composer 是 contenteditable + Lexical 编辑器。这里有两个坑：
 *
 * ① 「假换行」：只把 `\n` 塞进文本节点是不行的。CSS `white-space: pre-wrap` 会把文本节点里的
 *    裸 `\n` 渲染成换行，**看着完全正常**，但那不是编辑器认可的换行节点 —— X 提交时按自己的
 *    节点模型序列化，裸 `\n` 被丢掉。用户看到的现象就是：
 *    「面板里有换行、composer 里也有换行，一发出去变成一整段」。
 *    必须让编辑器建出**真正的换行节点**（<br> / LineBreakNode），也就是"真按了回车"。
 *
 * ② 校验不能拿 textContent 跟原文严格比对：真换行节点的 textContent 里**没有** `\n`
 *    （<br> 不产生字符），严格比对会误判成"没填进去"→ 把已填好的内容清掉重来 →
 *    最后反而留下裸 `\n` 版本。**这正是之前换行丢失的根因。**
 *
 * 策略（逐级降级，每级都验证「文字对得上 + 没有裸 \n」）：
 *   1. 合成 paste —— 走编辑器的粘贴处理，它会按行拆成真正的换行节点
 *   2. 逐行插入 + insertLineBreak —— 直接让编辑器插入它自己的换行节点
 *   3. 兜底：整体 insertText
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */

/** 文本节点里是否残留裸 \n（= 假换行，提交时会被 X 吞掉） */
function hasRawNewlineInTextNodes(el: HTMLElement): boolean {
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').includes('\n');
    return Array.from(node.childNodes).some(walk);
  };
  return walk(el);
}

/**
 * 内容是否已写入。忽略空白差异：
 * 真换行节点的 textContent 不含 \n，各行文字会直接连在一起。
 */
function sameText(el: HTMLElement, expected: string): boolean {
  const squash = (s: string) => s.replace(/[\s\u200b]+/g, '');
  return squash(el.textContent ?? '') === squash(expected);
}

function clearComposer(el: HTMLElement): void {
  el.focus();
  try {
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
  } catch {
    /* 忽略，插入后的校验会兜底 */
  }
}

function pasteText(el: HTMLElement, text: string): void {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(ev);
  } catch {
    /* 交给下一级策略 */
  }
}

/** 派发回车键，让编辑器把它当作"用户按了回车"，从而建出真正的换行节点 */
function pressEnter(el: HTMLElement): void {
  const init = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
}

/** 逐行写入，行间用 insertLineBreak（编辑器原生换行节点），插不进就退回合成回车 */
function insertLineByLine(el: HTMLElement, text: string): void {
  const lines = text.split('\n');
  el.focus();
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      let broke = false;
      try {
        broke = document.execCommand('insertLineBreak');
      } catch {
        broke = false;
      }
      if (!broke) pressEnter(el);
    }
    if (!lines[i]) continue;
    try {
      document.execCommand('insertText', false, lines[i]);
    } catch {
      /* 继续，最后由校验兜底 */
    }
  }
}

/** 填入是否可信：文字对得上，且（原文含换行时）没有留下裸 \n */
function isGoodFill(el: HTMLElement, expected: string): boolean {
  if (!sameText(el, expected)) return false;
  if (!expected.includes('\n')) return true;
  return !hasRawNewlineInTextNodes(el);
}

export function fillReplyComposer(el: HTMLElement, text: string): boolean {
  const target = text.trim();

  // 1) 合成 paste（首选：走编辑器粘贴处理，一次插入、状态同步）
  clearComposer(el);
  pasteText(el, target);
  if (isGoodFill(el, target)) return true;

  // 2) paste 没能建出真换行 → 逐行插入 + 原生换行
  clearComposer(el);
  insertLineByLine(el, target);
  if (isGoodFill(el, target)) return true;

  // 3) 兜底：整体 insertText（换行可能仍是假的，但没有更好的办法）
  clearComposer(el);
  try {
    document.execCommand('insertText', false, target);
  } catch {
    return false;
  }
  return sameText(el, target);
}

/** 同一套写入策略，Phase 2 的主发帖框也用它（命名去掉 reply 限定） */
export { fillReplyComposer as fillComposer };
