# TODO

> 本文件同时承担「问题交底」职责。**请先读第一章**，它是当前主线问题。
> 所有路径均相对仓库根 `x-copilot/`。项目背景见 `PROJECT.md`、`README.md`、`docs/`。

---

## 🔴 一、填入 X 输入框：三个症状（未解决）

### 1.1 症状（用户 2026-09-16 实测）

| # | 症状 | 观察到的地方 |
|---|---|---|
| **S1** | 帖子发出去后换行全没了，合并成一整段 | 发布后的帖子 |
| **S2** | 填入后按 **Backspace 删不掉**文字（删除键无效） | X 的编辑器里 |
| **S3** | **句号被错误换行**（换行位置不对） | 待确认是面板 / 编辑器 / 帖子 |

S1 + S2 高度疑似同一根因（见 1.4）。S3 必须先定位是哪一层产生的，否则会修错地方。

### 1.2 正确预期效果（验收标准，改完请逐条核对）

点「填入」之后，结果应当与**用户自己手动打字或手动 Ctrl+V 粘贴**完全等价：

1. **编辑器完全接管**：Backspace / Delete / 选中后删除都正常
2. X 的**字符计数**正确
3. **Post / Reply 按钮从 disabled 变为可用**（`isPostButtonEnabled()` 返回 `true`）
4. **换行只出现在模型输出里 `\n` 的位置，不多不少**
   - `a\nb` → 两行；`a\n\nb` → 中间一个空行
   - **不得**在句号 `。`、问号、逗号、分号等处自行断行
   - 不得吞掉或新增任何换行
5. **发出后的帖子与 composer 里看到的逐字一致**（含换行与空行）
6. **正文不得被改动**：标点、emoji、空格、全角/半角都不能变

### 1.3 第一步：先判断问题在哪一层（**别跳过**）

面板候选卡片、X 编辑器、发出后的帖子 —— 三处对照，同一段文本三处分别是什么样：

```
模型输出 (JSON 里的 \n)
   ↓
① 面板候选卡片        ← white-space: pre-wrap，能显示换行
   ↓ 点「填入」
② X 编辑器 (composer)
   ↓ 用户自己点 Post
③ 发出后的帖子
```

| 观察结果 | 结论 | 该去改哪 |
|---|---|---|
| ① 就换错行（每句一行） | **不是 fill 的问题**，是 prompt 让模型在句号后加了 `\n`，或解析层放错位置 | `extension/prompts/*.md`、`lib/llm/openai-compat.ts` |
| ① 对、② 错 | 写入方式的问题 | `lib/content/x/fill.ts` |
| ① ② 都对、③ 错 | 编辑器状态没被接管（S2 就是证据） | `lib/content/x/fill.ts` 的验收与策略 |
| ② 里按 Backspace 无效 | 文字只在 DOM、不在编辑器状态里 | 同上 |

**必须先拿到这个三处对照结果**，再动手。

### 1.4 S1 + S2 的根因判断（已基本确认）

S2 是决定性证据：**按 Backspace 删不掉 = 编辑器认为框里是空的 = 文字只在 DOM 里、不在编辑器自己的状态里**。

X 的 composer 是 `div[contenteditable="true"][role="textbox"]`，是个**富文本编辑器**（Lexical / DraftJS / ProseMirror 之一），它维护**自己的一份状态**，与 DOM 是两回事：

- 只把文字塞进 DOM → 看着有字（CSS `white-space: pre-wrap` 会把 `\n` 渲染成换行），
  但**退格删不掉**（S2），**提交时按编辑器状态序列化 → 换行被丢**（S1）。
- 必须让编辑器**认账**。X 自己的判据就是 **Post / Reply 按钮从 disabled 变可用** ——
  项目里已有这个函数：`lib/content/x/composer-detector.ts` 的 `isPostButtonEnabled()`，
  注释里原话是「这是「X 认账」的判据」。

> ⚠️ **历史教训**：前几轮一直拿 `el.textContent` 比对当验收（"文字进去了没有"），
> 但**只进 DOM 不算数**。项目里早就有正确的判据函数，应该一开始就用它。

### 1.5 涉及代码

| 文件 | 作用 |
|---|---|
| `extension/lib/content/x/fill.ts` | **唯一的写入实现**，两个 bug 的主战场 |
| `extension/components/App.tsx` | `fill()` 回调（约 623–648 行）：`post` 模式调 `fillComposer`，回复模式调 `fillReplyComposer`；成功才 toast「已填入」 |
| `extension/lib/content/x/composer-detector.ts` | `findPostComposer()` / `findReplyComposer()` / **`isPostButtonEnabled()`** |
| `extension/lib/content/x/selectors.ts` | selector 唯一来源：`composer`、`postButton = [data-testid="tweetButton"], [data-testid="tweetButtonInline"]` |
| `extension/prompts/post/head.md` | 发帖 prompt 里有「短句 + 空行」的排版规则（S3 可能出在这里） |
| `extension/lib/llm/openai-compat.ts` | 流式解析（`drainObjects` / `candidatesFromFragment`），`\n` 转义在这里还原 |

### 1.6 现在的实现（commit `27a8094`）

`fill.ts` 目前是**三策略依次试，谁被编辑器认账就用谁**：

| 顺序 | 策略 | 做法 |
|---|---|---|
| 1 | `全选 + 一次性 insertText` | `focus()` → `execCommand('selectAll')` → `execCommand('insertText', false, text)` |
| 2 | `合成 paste` | `new DataTransfer()` 放 `text/plain` → `new ClipboardEvent('paste', …)` 派发到 composer（构造后若 `clipboardData` 为空，用 `Object.defineProperty` 手动挂上） |
| 3 | `逐行 + insertLineBreak` | 按 `\n` 切行，行间 `document.execCommand('insertLineBreak')` |

验收 = `sameText(el, text)`（忽略空白差异）**且** `isPostButtonEnabled() !== false`。

**临时诊断**：`diagFill()` 会在 Console 打印，定位完必须删掉：

```
[x-copilot:fill] 策略名 { 文字对得上, 清空后按钮可用, 填入后按钮可用,
                          文本节点含裸换行, br数, 子元素, 文本前60, 片段 }
```

判读：哪条策略的 **`填入后按钮可用: true`** 才是能用的路径；三条都 `false` = 编辑器完全没接管。

### 1.7 已尝试的方案与结果（**别重复这些**）

| commit | 做了什么 | 结果 |
|---|---|---|
| `ef90ab9` | 加 `hasRawNewlineInTextNodes()` 当"合格门槛" | ❌ 设计错了：把已填好的结果判为不合格 → 清掉重填 → 亲手换成错版本 |
| `de23254` | 去掉门槛，改「paste 成功即返回、绝不再清空重填」 | 仍不行 |
| `c00aca9` | 强制给合成 `ClipboardEvent` 挂 `clipboardData` + 加诊断 | 仍不行（并出现 S2） |
| `27a8094` | 三策略 + 用 `isPostButtonEnabled()` 当验收 | 仍不行（并出现 S3） |

### 1.8 关键事实与外部资料（**互相矛盾，先自己确认编辑器类型**）

- **Clipboard API 规范（W3C）**：*Synthetic clipboard events will not actually modify the clipboard or the document.* —— 合成 paste 事件浏览器**不会真的粘贴**，只是"通知页面"；数据必须由页面自己的 paste handler 消费。
- **MDN**：`ClipboardEvent` 用构造函数创建时，`clipboardData` **可能是 `null`**。
- **StackOverflow 79666573「New line in a X post」**：同样的 bug。提问者试过 `\r\n`、合成回车、`execCommand('insertText')` **全部失败**，最后**只有"合成 paste + `text/plain`"** 能同时保住显示与提交后的换行。
- **dev.to「Your AI agent typed the tweet and clicked Post」**：称 X 用的是 **DraftJS**，`execCommand('insertText')` 会把文字孤立在 DOM 外（＝S2 的症状）；给的可行配方是「focus → `selectAll`+`delete` **执行两遍**（状态会滞后）→ **每 20-30 字符分块输入并逐块校验**」，且提醒「**别写换行**，DraftJS 里换行会产生新 block，打乱光标」。
- **某 X 发帖 skill**：称 X 用的是 **ProseMirror (tiptap)**，且**唯一可靠**的是 `focus(); execCommand('selectAll'); execCommand('insertText', false, text)`，并声称「换行、emoji 全部完整保留」。

→ **三份资料说的编辑器都不一样**（Lexical / DraftJS / ProseMirror），结论也互相矛盾。
**第一步应该是确认 X 当前实际用的是什么编辑器**：
DevTools 选中 composer，检查元素上是否有 `data-lexical-editor`、`__lexicalEditor`、React fiber 里的 editor 实例，或看它监听 `beforeinput` 的方式。

### 1.9 尚未尝试的方向（按可行性排序）

1. **复制到剪贴板 + 提示用户按 Ctrl+V**（**最稳的兜底**）
   点「填入」时 `navigator.clipboard.writeText(text)`（fill 由用户点击触发，有 user activation，可以写剪贴板），然后 toast 提示「已复制，按 Ctrl+V 粘贴」。
   —— 真实粘贴一定走编辑器自己的粘贴处理 → **退格能删、换行也能发出去**，100% 等价于手动操作。
   代价：多按一次键盘。但比"看着能填、其实是假填"好得多。
2. **MAIN world 注入**：content script 跑在 isolated world，合成的事件与 `DataTransfer` 跨世界。
   改成 `world: 'MAIN'` 再试（WXT 的 content script 支持；manifest 里是 `"world": "MAIN"`）。
3. **按 dev.to 的配方**：`selectAll` + `delete` **连做两遍** → 然后**分块**写入（20-30 字符一块，每块后可校验），并且**不要在一次 insertText 里带 `\n`**。
4. **B 计划（改目标）**：不追求"自动填入"，改成「复制 + 引导粘贴」作为主路径（同 1）。

### 1.10 别踩的坑

- ⚠️ **别再用 `textContent` 严格等值当验收**：编辑器真正换行节点的 `textContent` 里**没有** `\n`（`<br>` 不产生字符），严格比对会把"已经填好"误判为失败 → 触发降级 → 降级路径更糟。
- ⚠️ **别把"正确的写入结果"再清掉重填**：这是 `ef90ab9` 犯的错。
- ⚠️ **别在没拿到 1.3 的三处对照 / `[x-copilot:fill]` 日志之前改代码** —— 这个 bug 已经纯靠推理绕了四轮。
- ⚠️ **只填入，绝不点击 Reply / Send / Post**（项目红线）。
- ⚠️ 改完记得**删掉 `diagFill()` 及其调用点**。

---

## 🟡 二、详情页点评论图标会重复触发生成（未解决）

**状态**：待解决。两次修复尝试（`32c0441` / `964cffd`）均无效，代码已回滚到 `32c0441` 状态（仅保留 null 确认期，无幂等保护）。

### 现象

进入帖子详情页（URL 为 `/handle/status/<id>`），Panel 自动生成一次评论后，**点击评论图标弹出 Reply Modal 会再次触发生成**。预期：URL 和 id 都没变，应完全静默复用已有结果。

注意：`/home` 时间线里点评论图标 → Modal 检测 + 自动生成，这条链路是正常的。只有详情页的重复触发有问题。

### 已排除 / 已尝试

1. `32c0441`：瞬态 null 确认期（400ms 复查）—— 原假设是 Modal 挂载瞬间 article 全部卸载导致误判离开。无效。
2. `964cffd`：`inFlightIdRef` 同 id 在途幂等跳过 + 离开不取消在途生成。理论上任何同 id 重复触发都会被跳过，**但用户实测仍然重新生成**。已回滚。

### 关键疑点

幂等保护生效的前提是「重复触发走 `runGenerate` 且 `target.id` 一致」。仍然重新生成意味着存在未知的第三条路径：

- **H1：详情页点评论图标时 URL 变化了**（如 pushState 到 `/i/web/status/<id>` 或其他变体）→ id 相同但 detector 判定"变化" → emit → 缓存未命中（首次生成还在途中）→ 再次生成。**验证最简单**：看 Console 里 `current tweet changed:` 是否在点评论图标时出现、后面的 id 是什么。
- **H2：Modal 里的 article 被 detector 当成了另一条 tweet**（reply modal 的 article 结构不同导致 id 提取不同）—— 但详情页 URL 优先，不该走 Modal 分支。除非 URL 同时变化（与 H1 合并）。
- **H3：App 的 detector useEffect 因依赖变化重建**，新 detector 的 `lastId` 从 null 起步，初始 check 重新 emit 并触发自动生成。

### 下一步

1. 刷新扩展 + X 页面，打开 Console 过滤 `[X Copilot]`，复现一次：进帖子 → 生成完成 → 点评论图标。
2. 完整记录日志序列，重点看：点评论图标那一刻是否出现 `current tweet changed:`，若有，新 id 与旧 id 是否一致。
3. 定位到具体层后修复（H1/H2 → detector 里对 `/i/web/status/` 变体做归一化；H3 → 用 ref 持有 detector 或把 observe 的 emit 改为模块级单例）。
4. 修复时建议**同时保留两层防护**：检测层正确归一化 + 动作层幂等。

### 相关提交

- `a5de818` reply modal 检测（正常工作的部分，勿动）
- `ef87262` 检测加固 + `[X Copilot]` console.debug 日志（排查靠它）
- `32c0441` null 确认期（保留中）
- `964cffd` 幂等保护（已回滚，待定位后带根因重新引入）

---

## ✅ 三、[已修复] 设置页排序控件的"排序不生效"

**根因**：不是控件问题，是**读取配置时把用户顺序丢了**。`normalizeStyles` 的实现是「遍历默认清单 → 按 key 查存储值」，输出顺序恒为默认顺序；用户排好的顺序在每次加载时被静默覆盖。数字（count）是条目属性所以不受影响——这正是"数字生效、顺序回退"的原因。

**修复**（`8c0f772`）：以存储顺序为准还原列表，默认清单里新增（存储中不存在）的风格追加到末尾；`lib/config.ts` 与静态 options 页两处同步修。

**教训**：
- "控件无响应"和"数据被覆盖"要区分——本案例中 UI 其实一直是好的，是持久层把顺序吃掉了
- 调试输出要保留历史（本次「已自动保存」日志把「上移」日志覆盖，导致多绕了一轮）

**遗留**：拖拽排序（HTML5 DnD / pointer 事件）此前确实无反应，现已用上下箭头替代，拖拽不再维护。

---

## 附：当前暂停 / 已知待办（非 bug）

- **评论清理（Clean）整体暂停**：`components/App.tsx` 的 `CLEAN_AUTO_ENABLED = false`，设置页分区 `display:none`，面板按钮不渲染；代码全保留，完善后置回即可。
- **扩展图标未设置**：`wxt.config.ts` 没有 `icons` 字段，Chrome 里显示默认灰色图标（仓库根 `assets/logo.png` 可用）。
- 未做的增强：候选级微调、用量与成本护栏、自定义风格。
