/**
 * 把评论写入 X 的 Reply composer（替换语义）。
 *
 * X 的 composer 是 contenteditable + Lexical 编辑器，不能用 innerText 直接赋值，
 * execCommand('insertText') 会双重插入（浏览器默认行为 + 编辑器各处理一次，
 * 其中一份游离在编辑器状态外，形成删不掉的"影子"）。
 *
 * 策略：
 *   1. focus → execCommand('selectAll') + execCommand('delete') 清空（替换语义）
 *   2. 优先派发合成 paste 事件 —— Lexical 的 paste handler 会 preventDefault
 *      并把文本纳入自己的状态，只插入一次，DOM 与编辑器状态同步
 *   3. 失败则降级 execCommand('insertText')（此时选区已清空，不会再叠加）
 *   4. 校验：清空后填入的 composer 文本应与目标文本完全一致
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */

function readBack(el: HTMLElement, expected: string): boolean {
  return (el.textContent ?? '').trim() === expected.trim();
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

function pasteText(el: HTMLElement, text: string): boolean {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(ev);
    return true;
  } catch {
    return false;
  }
}

export function fillReplyComposer(el: HTMLElement, text: string): boolean {
  const target = text.trim();

  // 清空旧内容（替换而不是叠加）
  clearComposer(el);

  // 首选：合成 paste 事件（编辑器状态同步，单次插入）
  pasteText(el, target);
  if (readBack(el, target)) {
    return true;
  }

  // 降级：清空后 execCommand('insertText')（选区为空，不会叠加）
  clearComposer(el);
  try {
    document.execCommand('insertText', false, target);
  } catch {
    return false;
  }

  return readBack(el, target);
}
