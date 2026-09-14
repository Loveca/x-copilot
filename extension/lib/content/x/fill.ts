/**
 * 把评论写入 X 的 Reply composer。
 *
 * X 的 composer 是 contenteditable + 自研编辑器，不能用 innerText 直接赋值。
 * 策略：focus → 选区移到末尾 → execCommand('insertText')（兼容性最好）
 *      → 失败则降级为 beforeinput + 手动插入文本节点 + input 事件。
 *
 * ⚠️ 只填入，绝不点击 Reply / Send / Post。
 */
export function fillReplyComposer(el: HTMLElement, text: string): boolean {
  const probe = text.slice(0, 30);

  el.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false); // 光标移到末尾
  selection?.removeAllRanges();
  selection?.addRange(range);

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }

  const readBack = () => (el.textContent ?? '').includes(probe);

  if (inserted && readBack()) {
    return true;
  }

  // 降级：派发 beforeinput，再手动追加文本节点，并补发 input 事件
  try {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      })
    );
    el.appendChild(document.createTextNode(text));
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
    );
  } catch {
    return false;
  }

  return readBack();
}
