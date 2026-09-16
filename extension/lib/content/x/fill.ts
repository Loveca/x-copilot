/**
 * 把文本写进 X 的 composer（回复框 / 主发帖框，替换语义）。
 *
 * ⚠️ 这里的写入方式是被外部实践反复验证过的，别随便换：
 *   X 的 composer 是 contenteditable + Lexical 编辑器。往里面写文字有两条路，
 *   但只有第一条能同时满足「面板/composer 里显示有换行」**和**「发出去仍然有换行」：
 *
 *   ✅ 合成 paste 事件（DataTransfer 里放 text/plain）
 *      —— 走编辑器自己的粘贴处理，换行会变成编辑器认可的换行节点，提交后保留。
 *   ❌ execCommand('insertText') / 直接改 DOM / 合成回车
 *      —— 文字进得去，CSS `white-space: pre-wrap` 也会把 `\n` 渲染成换行，**看着完全正常**，
 *         但那不是编辑器认的换行节点：提交时被丢掉。现象就是
 *         「面板里有换行、composer 里也有换行，一发出去变成一整段」。
 *
 * ⚠️ 因此铁律：**只要 paste 成功（文字已进入），就绝不能再清空重填。**
 *    早期版本在 paste 之后用严格等值校验判"失败"，把已填好的内容清掉、重塞 insertText 版本，
 *    等于亲手把正确结果换成错的 —— 这才是换行在提交时消失的真凶。
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */

/**
 * 内容是否已写入。忽略空白差异：
 * 真换行节点的 textContent 里**没有** `\n`（<br> 不产生字符），
 * 用严格等值比较会把「已经填好」误判成「没填进去」。
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

/** 合成 paste —— 唯一能让换行在提交后依然存在的方式 */
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
    /* 交给调用方兜底 */
  }
}

export function fillReplyComposer(el: HTMLElement, text: string): boolean {
  const target = text.trim();

  // 1) 合成 paste（首选，也是唯一能保住换行的方式）
  clearComposer(el);
  pasteText(el, target);
  if (sameText(el, target)) return true;

  // 2) 再试一次（编辑器偶尔要等焦点稳定后才吃 paste；先清空，避免半截内容叠加）
  clearComposer(el);
  el.focus();
  pasteText(el, target);
  if (sameText(el, target)) return true;

  // 3) 最后手段：整段 insertText。
  //    ⚠️ 这条路填出来的换行**可能在提交时被吞**，但总比什么都没填强。
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
