/**
 * 把文本写进 X 的 composer（回复框 / 主发帖框，替换语义）。
 *
 * ⚠️ 写入方式有讲究，别随便换：
 *   X 的 composer 是 contenteditable + Lexical 编辑器。往里面写文字有两条路，
 *   只有第一条能同时满足「面板/composer 显示有换行」**和**「发出去仍然有换行」：
 *
 *   ✅ 合成 paste 事件 —— 走编辑器自己的粘贴处理，换行会成为编辑器认可的换行节点。
 *      ⚠️ 规范（Clipboard API）：**合成 paste 事件浏览器不会真的粘贴**，
 *      只是"通知页面"；数据必须由页面自己的 paste handler 消费。
 *      所以 `event.clipboardData` 必须是可读的 —— MDN 明确说用构造函数创建时它**可能是 null**。
 *      下面 pasteText() 因此做了"构造后仍为空就手动挂上"的处理。
 *
 *   ❌ execCommand('insertText') / 直接改 DOM / 合成回车
 *      —— 文字进得去，CSS `white-space: pre-wrap` 也会把 `\n` 渲染成换行，**看着完全正常**，
 *         但那不是编辑器认的换行节点：提交时被丢掉。现象就是
 *         「面板里有换行、composer 里也有换行，一发出去变成一整段」。
 *      （外部实证：StackOverflow「New line in a X post」提问者试过 \r\n、合成回车、insertText 全失败，
 *        只有合成 paste 能同时保住显示与提交后的换行。）
 *
 * ⚠️ 铁律：**只要 paste 成功（文字已进入），就绝不能再清空重填**。
 *    早期版本在 paste 之后用严格等值校验判"失败"，把已填好的内容清掉、重塞 insertText 版本，
 *    等于亲手把正确结果换成错的。
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */

/**
 * 内容是否已写入。忽略空白差异：
 * 真换行节点的 textContent 里**没有** `\n`（<br> 不产生字符），
 * 严格等值比较会把"已经填好"误判成"没填进去"。
 */
function sameText(el: HTMLElement, expected: string): boolean {
  const squash = (s: string) => s.replace(/[\s\u200b]+/g, '');
  return squash(el.textContent ?? '') === squash(expected);
}

/** 文本节点里是否残留裸 \n（＝靠 CSS 渲染出来的"假换行"） */
function hasRawNewlineInTextNodes(el: HTMLElement): boolean {
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').includes('\n');
    return Array.from(node.childNodes).some(walk);
  };
  return walk(el);
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
    // ⚠️ 有的 Chrome 会忽略构造函数里的 clipboardData（读出来是 null）→ 手动挂一次
    if (!ev.clipboardData) {
      Object.defineProperty(ev, 'clipboardData', { value: dt, configurable: true });
    }
    el.dispatchEvent(ev);
  } catch {
    /* 交给调用方兜底 */
  }
}

/**
 * 临时诊断：定位「composer 里有换行、发出去变一整段」到底卡在哪一步。
 * 定位完成后删除本函数与所有调用。
 */
function diagFill(el: HTMLElement, stage: string): void {
  console.debug('[x-copilot:fill]', stage, {
    裸换行: hasRawNewlineInTextNodes(el),
    br数: el.querySelectorAll('br').length,
    子元素: [...el.children].map((c) => c.tagName).join(','),
    文本前60: JSON.stringify((el.textContent ?? '').slice(0, 60)),
    片段: el.innerHTML.slice(0, 120),
  });
}

export function fillReplyComposer(el: HTMLElement, text: string): boolean {
  const target = text.trim();

  // 1) 合成 paste（首选，也是唯一能保住换行的方式）
  clearComposer(el);
  pasteText(el, target);
  diagFill(el, '1-paste');
  if (sameText(el, target)) return true;

  // 2) 再试一次（编辑器偶尔要等焦点稳定后才吃 paste；先清空，避免半截内容叠加）
  clearComposer(el);
  el.focus();
  pasteText(el, target);
  diagFill(el, '2-paste-retry');
  if (sameText(el, target)) return true;

  // 3) 最后手段：整段 insertText。
  //    ⚠️ 这条路填出来的换行**会在提交时被吞**，但总比什么都没填强。
  clearComposer(el);
  try {
    document.execCommand('insertText', false, target);
  } catch {
    return false;
  }
  diagFill(el, '3-insertText');
  return sameText(el, target);
}

/** 同一套写入策略，Phase 2 的主发帖框也用它（命名去掉 reply 限定） */
export { fillReplyComposer as fillComposer };
