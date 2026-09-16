# TODO

## [已修复] 设置页排序控件的"排序不生效"

**根因**：不是控件问题，是**读取配置时把用户顺序丢了**。`normalizeStyles` 的实现是「遍历默认清单 → 按 key 查存储值」，输出顺序恒为默认顺序；用户排好的顺序在每次加载时被静默覆盖。数字（count）是条目属性所以不受影响——这正是"数字生效、顺序回退"的原因。

**修复**（提交 `8c0f772`）：以存储顺序为准还原列表，默认清单里新增（存储中不存在）的风格追加到末尾；`lib/config.ts` 与静态 options 页两处同步修。

**教训**：
- 排查时"控件无响应"和"数据被覆盖"要区分——本案例中 UI 其实一直是好的，是持久层把顺序吃掉了
- 调试输出要保留历史（本次「已自动保存」日志把「上移」日志覆盖，导致多绕了一轮）

**遗留**：拖拽排序（HTML5 DnD / pointer 事件）此前确实无反应，现已用上下箭头替代，拖拽不再维护。

---

## [BUG] 详情页点评论图标会重复触发生成（未解决）

**状态**：待解决。两次修复尝试（32c0441 / 964cffd）均无效，代码已回滚到 32c0441 状态（仅保留 null 确认期，无幂等保护）。

### 现象

进入帖子详情页（URL 为 `/handle/status/<id>`），Panel 自动生成一次评论后，**点击评论图标弹出 Reply Modal 会再次触发生成**。预期：URL 和 id 都没变，应完全静默复用已有结果。

注意：`/home` 时间线里点评论图标 → Modal 检测 + 自动生成，这条链路是正常的。只有详情页的重复触发有问题。

### 已排除 / 已尝试

1. **32c0441**：瞬态 null 确认期（400ms 复查）——原假设是 Modal 挂载瞬间 article 全部卸载导致误判离开。无效。
2. **964cffd**：`inFlightIdRef` 同 id 在途幂等跳过 + 离开不取消在途生成。**理论上任何同 id 重复触发都会被跳过，但用户实测仍然重新生成**。已回滚。

### 关键疑点

964cffd 的幂等保护生效的前提是「重复触发走 `runGenerate` 且 `target.id` 一致」。仍然重新生成意味着存在未知的第三条路径，候选假设：

- **H1：详情页点评论图标时 URL 变化了**（如 pushState 到 `/i/web/status/<id>` 或其他变体）→ id 相同但 detector 判定「变化」→ emit → 缓存未命中（首次生成还在途中）→ 再次生成。**验证方法最简单**：看 Console 日志里 `current tweet changed:` 是否在点评论图标时出现、后面的 id 是什么。
- **H2：Modal 里的 article 被_detector 当成了另一条 tweet**（比如 reply modal 的 article 结构不同导致 id 提取不同）——但详情页 URL 优先，不该走 Modal 分支。除非 URL 同时变化（与 H1 合并）。
- **H3：App 的 detector useEffect 因依赖变化重建**，新 detector 的 `lastId` 从 null 起步，初始 check 重新 emit 并触发自动生成。`runGenerate`/`cancelGeneration` 都是 `useCallback([])`，理论上稳定，但需确认。

### 下一步（按顺序）

1. 刷新扩展 + X 页面，打开 Console 过滤 `[X Copilot]`，复现一次：进帖子 → 生成完成 → 点评论图标。
2. 完整记录日志序列，重点看：
   - 点评论图标那一刻是否出现 `current tweet changed:`
   - 出现的话，新 id 和之前的 id 是否一致（不一致 → H1/H2；一致但依然生成了 → H3）
3. 根据日志定位到具体层后修复：
   - H1/H2 → 在 detector 里对 `/i/web/status/` 或 URL 变体做归一化
   - H3 → 用 ref 持有 detector，或把 observe 的 emit 改为模块级单例
4. 修复时建议**同时保留两层防护**：检测层正确归一化 + 动作层幂等（964cffd 的 inFlightIdRef 思路本身没错，单独回滚它可能只是因为它防的不是这条路径）。

### 相关提交（历史已丢失，见下方说明）

- `a5de818` reply modal 检测（正常工作的部分，勿动）
- `ef87262` 检测加固 + `[X Copilot]` console.debug 日志（排查靠它）
- `32c0441` null 确认期（保留中）
- `964cffd` 幂等保护（已回滚，待定位后带根因重新引入）

---

## [BUG] 发帖换行在提交后消失（未解决）

**状态**：待解决。2026-09-16 暂停（用户决定先记 TODO）。三轮修复尝试均无效：`ef90ab9` → `de23254` → `c00aca9`。

### 现象

从候选卡片「填入」到 X 发帖框的多行文本：**面板里显示有换行、发帖框里也显示换行和空行，但帖子一发出去换行全没了，合并成一整段。**

**2026-09-16 新增关键症状（同一个根因）：填入之后按 Backspace 删不掉文字。**
说明文字只在 DOM 里、**不在编辑器自己的状态里**（编辑器认为框是空的，所以退格无事可删）。
这也解释了为什么提交时换行会丢 —— 编辑器序列化的是它自己的状态。

> 背景：2026-09-16 给发帖 prompt 加了「短句 + 空行」的排版规则，模型输出才第一次真正带换行，于是暴露了这个问题。之前的输出都是单段，所以一直没发现。

### 当前验收标准（关键）

X 自己「认账」的判据是 **Post / Reply 按钮从 disabled 变可用**（`isPostButtonEnabled()`，`composer-detector.ts`）。
**只验证文字进没进 DOM 是不够的** —— 必须验证按钮被点亮，才说明编辑器接管了这段文字。
`fill.ts` 现在以此为标准：三个策略（全选+insertText / 合成 paste / 逐行+insertLineBreak）依次试，
谁被认账就用谁；都不认账则保留文字并打 Console 日志 `[x-copilot:fill]`。

### 已排除（关键证据，别再重复验证）

- **不是 X 的锅**：人工在记事本里打多行文本 → 在 X 发帖框 **Ctrl+V 粘贴** → 发出去**空行还在**。说明 X 保留「粘贴进去的内容」的换行。
- **不是面板的锅**：面板候选用 `white-space: pre-wrap`，显示一直正常。
- ⇒ 问题只可能出在**我们怎么把文字写进 composer**（`lib/content/x/fill.ts`）。

### 已尝试（均无效）

1. 校验放宽（严格等值 → 忽略空白差异）
2. 逐行插入 + `execCommand('insertLineBreak')`（插不进退回合成回车 keydown）
3. 去掉"假换行"判定门槛（`hasRawNewlineInTextNodes`），改为"paste 成功即返回，绝不再清空重填"
4. 构造 `ClipboardEvent` 后强制 `Object.defineProperty` 挂上 `clipboardData`

### 规范依据（已查证，别再重查）

- **Clipboard API（W3C）**：*Synthetic clipboard events will not actually modify the clipboard or the document.* —— **合成 paste 事件浏览器不会真的粘贴**，只是"通知页面"；数据必须由页面自己的 paste handler 消费。
- **MDN**：`clipboardData` **用构造函数创建事件时可能是 `null`**（浏览器自己派发时才保证非 null）。为 null → 页面 handler 读不到 → 空操作。
- **外部实证**：StackOverflow [`New line in a X post`](https://stackoverflow.com/questions/79666573/new-line-in-a-x-post) —— 同一个问题。提问者试过 `\r\n`、合成回车、`execCommand('insertText')` **全失败**；唯一能同时做到「显示有换行 + 发出去仍有换行」的只有**合成 paste 事件 + `text/plain`**。

### 关键疑点（按可能性排序）

- **H1（最可疑）：content script 跑在 isolated world，合成的事件与 `DataTransfer` 跨世界，X 的 paste handler 可能拿不到数据** → paste 空操作 → 掉到 `insertText` 兜底 → 产出"假换行"。
  - **验证方式**：把填写的注入改成 **MAIN world** 再试（WXT content script 支持 `world: 'MAIN'`；manifest 里是 `"world": "MAIN"`）。
- **H2**：X/Lexical 的 paste handler 对合成事件另有条件（`isTrusted` 之类），直接忽略。
- **H3**：写进去的确是"假换行"——`\n` 躺在文本节点里，靠 CSS `pre-wrap` 渲染；X 提交时按自己的节点模型序列化，把这些 `\n` 丢掉。

### 下一步

1. **先拿诊断数据**：`fill.ts` 里留了临时诊断 `diagFill()`，每次尝试会打印
   `[x-copilot:fill] 策略名 { 文字对得上, 清空后按钮可用, 填入后按钮可用, 文本节点含裸换行, br数, 子元素, 文本前60, 片段 }`
   - 某条策略里 **`填入后按钮可用: true`** → 这条就是能用编辑器认账的路径，问题已解决
   - 三条都是 `false` → 编辑器完全没接管，说明写入方式得换（考虑"复制到剪贴板 + 提示用户 Ctrl+V"这种保证可行的兜底）
   - `文本节点含裸换行: true` → 写进去的是"假换行"
2. 若三条都不认账 → 试 **MAIN world 注入**（H1）或改用剪贴板方案。
3. 若被认账但提交仍丢换行 → 转"占位字符"方案：空行用不可见字符（如 U+2800）占位；或改用双换行。
4. **修好后删掉 `diagFill()` 及调用点。**

### 相关提交

- `ef90ab9` 第一版（引入 `hasRawNewlineInTextNodes` 门槛 —— 后被证明是错的设计，会误杀正确结果）
- `de23254` 去掉门槛 + 确立铁律「paste 成功即返回、绝不再清空重填」
- `c00aca9` 强制挂 `clipboardData` + 加临时诊断 `diagFill()`
- `（本次）` fill 改为**三策略 + 用 Post/Reply 按钮是否点亮当验收标准**，并去掉「先删再填」的重复清空

