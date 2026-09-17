# TODO

> 本文件同时承担「问题交底」职责。**请先读第一章**，它是当前主线问题。
> 所有路径均相对仓库根 `x-copilot/`。项目背景见 `PROJECT.md`、`README.md`、`docs/`。

---

## 🟠 一、填入 X 输入框：四个症状（S2 已好转，**S4 待排查**）

> **2026-09-17 更新（待用户实测验证）**：
> - **S4 修复尝试**：`fill.ts` ①**移除「合成 beforeinput」策略**（1.14 H1 头号嫌疑——只改 EditorState 不走完整渲染链）；
>   ②**合成 paste 提为首选**（SO 79666573 针对X本站的实证；此前它"失败"多半是旧探针取错按钮的误判）；
>   ③**清空改单遍**（H2：第二遍 delete 在状态已空后再执行，DOM 与状态从起点错位）。
> - **S3 修复尝试（prompt 层）**：`head.md` 排版规则由「每句一行」改为「2-4 个 chunk、chunk 内 1-3 句连排不换行、
>   chunk 间一个空行、禁止机械地在每个句号后断行」。
> - 验证方法不变：1.12 的验收清单 + Console 看 `[x-copilot:fill]` 哪条策略 `策略被认账: true`。
> - **「填入时闪一下」已修（同日二次，用户反馈 bug 大致修好后剩余此症状）**：
>   成因 = 回退循环的可见足迹——写入前先清空（400ms 空白探针期）+ 任何验收不过就把已写好的内容清掉换策略重写。
>   改为**非破坏性**：①所有策略改「全选+替换」语义（selectAll 后 paste / insertText 直接替换选区，不再有清空空白期）；
>   ②文字与换行结构已正确时**绝不重写**，按钮判据只触发 800ms 宽限等待。
>   注：发帖/回复本来就共用同一个 fill 函数；此前"发帖闪、回复不闪"的差异来自发帖内容是多行、
>   要多过一道 `newlinesAreReal` 验收，更容易被误判降级到清空重写。

> **2026-09-16 状态**：`fill.ts` / `composer-detector.ts` / `App.tsx` 已改，`compile` + `build` 通过。
> 浏览器实测结果：**S2 明显好转** —— 编辑器现在**确实接管了文字**（退格真的删掉了，提交后能看到），
> 但暴露出**新的 S4：删除生效了、界面却不刷新**。见 1.14。

### 1.0 根因（probe 实测确认，取代此前所有推测）

**X 的 composer 是 DraftJS**。2026-09-16 在 x.com 用 probe 实测：

```
{Lexical: false, DraftJS: true, ProseMirror: false}
```

这终结了 1.8 里那三份互相矛盾的外部资料。DraftJS 的机理与两个症状严丝合缝：

**`EditorState` 是唯一真相，且它不监听 DOM 变化。**

| 症状 | 机理 |
|---|---|
| **S2** 退格删不掉 | Backspace 走 `EditorState`，状态里没这段文字 → 无事可删。文字只在 DOM 里 |
| **S1** 发出去换行没了 | 提交时序列化的是 `EditorState`，不是 DOM → 编辑器状态里根本没这段文字/换行 |

### 1.0.1 为什么前四轮修复全部无效（关键教训）

`27a8094` 把验收标准换成「Post 按钮点亮」方向是对的，但那个探针**取错了按钮**：

```ts
// 改前：不接收 composer，拿全页面第一个可见按钮
export function isPostButtonEnabled(): boolean | null {
  const btn = [...document.querySelectorAll<HTMLElement>(X_SELECTORS.postButton)].find(isVisible);
```

详情页点评论图标弹出 Reply Modal 时，页面上有**两个**发帖按钮：详情页底部内联框一个（DOM 序在前、且是**禁用**的），弹窗里一个（用户正在填的）。`querySelectorAll` 按文档序 → 永远拿到内联那个禁用按钮 → **刚填好的弹窗被判成"没被认账"** → 继续降级到更差的策略 → 最终留下的是最差那个策略的产物。

**所以四轮都在调策略，但测量仪器是坏的，怎么调都会失败。** 同理 `findReplyComposer()` 也没限定弹窗作用域（而 `findPostComposer()` 早就处理了 dialog 优先 —— 同类问题只修了一处）。

### 1.1 症状（用户 2026-09-16 实测）

| # | 症状 | 观察到的地方 | 状态 |
|---|---|---|---|
| **S1** | 帖子发出去后换行全没了，合并成一整段 | 发布后的帖子 | 待验证 |
| **S2** | 填入后按 **Backspace 删不掉**文字（删除键无效） | X 的编辑器里 | ✅ **已好转** |
| **S3** | **句号被错误换行**（换行位置不对） | 待确认是面板 / 编辑器 / 帖子 | 未定位（见 1.13） |
| **S4** | **退格"看起来没删"，但提交后字符确实被删了** —— 编辑器状态变了，界面却是旧的 | X 的编辑器里 | 🔴 **新，待排查（见 1.14）** |

S1 + S2 是同一根因，**已由 1.0 的 DraftJS 结论解释清楚**。

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

### 1.3 三处对照法（**定位 S3 仍需要**）

面板候选卡片、X 编辑器、发出后的帖子 —— 同一段文本三处分别是什么样：

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

### 1.4 根因（见 1.0，此处仅存历史教训）

S1 + S2 的根因已由 1.0 的 DraftJS 结论解释。这里保留一条**通用教训**：

> ⚠️ 前几轮一直拿 `el.textContent` 比对当验收（"文字进去了没有"），但**只进 DOM 不算数** ——
> 对富文本编辑器，DOM 与它的内部状态是两回事。项目里早就写好了正确的判据
> （`isPostButtonEnabled()`，注释原话「这是「X 认账」的判据」），应该一开始就用它。
> **更关键的教训是：那个判据函数当时取错了作用域**（见 1.0.1），
> 所以"用对函数"还不够 —— 还得验证这个探针测的确实是目标对象。

### 1.5 涉及代码

| 文件 | 作用 |
|---|---|
| `extension/lib/content/x/fill.ts` | **唯一的写入实现**，两个 bug 的主战场 |
| `extension/components/App.tsx` | `fill()` 回调（约 623–648 行）：`post` 模式调 `fillComposer`，回复模式调 `fillReplyComposer`；成功才 toast「已填入」 |
| `extension/lib/content/x/composer-detector.ts` | `findPostComposer()` / `findReplyComposer()` / **`isPostButtonEnabled()`** |
| `extension/lib/content/x/selectors.ts` | selector 唯一来源：`composer`、`postButton = [data-testid="tweetButton"], [data-testid="tweetButtonInline"]` |
| `extension/prompts/post/head.md` | 发帖 prompt 里有「短句 + 空行」的排版规则（S3 可能出在这里） |
| `extension/lib/llm/openai-compat.ts` | 流式解析（`drainObjects` / `candidatesFromFragment`），`\n` 转义在这里还原 |

### 1.6 改后的实现

`fill.ts` 仍是**多策略依次试，谁被编辑器认账就用谁**，四处关键改动：

| 顺序 | 策略 | 做法 |
|---|---|---|
| 1 | `insertText` | `focus()` → `execCommand('selectAll')` → `execCommand('insertText', false, text)` |
| 2 | `合成 beforeinput` | `new InputEvent('beforeinput', {inputType:'insertText', data:text})` —— DraftJS 的 `editOnBeforeInput` 收到后会自己更新 `EditorState` |
| 3 | `合成 paste` | `DataTransfer` 放 `text/plain` → 派发 `ClipboardEvent`（`clipboardData` 为 null 时手动挂） |
| 4 | `逐行 + insertLineBreak` | 按 `\n` 切行，行间 `document.execCommand('insertLineBreak')` |

**改动 1（最关键）：验收等待异步**。原来写完**同步**读一次按钮就下结论 —— DraftJS 的 `onChange → React state → 按钮 disabled` 是异步链，同步读到的必然是写入前的旧值，**会把已经填好的结果判成失败**。现在改为轮询等待（60ms 一次，最多 1200ms）。

**改动 2：换行必须是真的**。新增 `newlinesAreReal()`：期望文本含 `\n` 时，**先否决**「裸 `\n` 还在文本节点里」，再要求有 `<br>` / 块级元素承载。这样能直接堵住 S1 —— 假换行（一个 block 里塞裸 `\n`）不再被判合格。
> ⚠️ 判定顺序是踩过坑的：若先判"有 DIV 就是真换行"，那「一个 DIV 装着整段带 `\n` 的文字」会被误判成合格 —— 而它恰恰就是假换行。

**改动 3：清空连做两遍**。DraftJS 状态更新滞后于 DOM，`selectAll`+`delete` 一遍只清 DOM。这是 dev.to 那份实测配方里的关键一步。

**改动 4：不再假装成功**。都不认账时不再返回"文字至少进去了"，而是把文本**复制到剪贴板**并提示用户 Ctrl+V —— 真实粘贴必然走编辑器自己的粘贴处理，100% 等价于手动操作。返回值由 `boolean` 改为 `FillOutcome`（`filled` / `copied` / `failed`），调用方据此给不同 toast。

配套修了作用域（见 1.0.1）：`isPostButtonEnabled(composer?)` 与 `findReplyComposer()` 都改为**弹窗优先**。

**诊断已保留但降级为常态日志**（`console.debug('[x-copilot:fill]', …)`，每条策略一行），不再需要专门的临时函数 —— 以后回归时直接看它。

### 1.7 已尝试的方案与结果（**别重复这些**）

| commit | 做了什么 | 结果 |
|---|---|---|
| `ef90ab9` | 加 `hasRawNewlineInTextNodes()` 当"合格门槛" | ❌ 设计错了：把已填好的结果判为不合格 → 清掉重填 → 亲手换成错版本 |
| `de23254` | 去掉门槛，改「paste 成功即返回、绝不再清空重填」 | 仍不行 |
| `c00aca9` | 强制给合成 `ClipboardEvent` 挂 `clipboardData` + 加诊断 | 仍不行（并出现 S2） |
| `27a8094` | 三策略 + 用 `isPostButtonEnabled()` 当验收 | 仍不行（并出现 S3）—— **验收探针取错按钮，见 1.0.1** |

### 1.8 编辑器类型（**已有答案**）

**X 的 composer 是 DraftJS**（2026-09-16 实测：`{Lexical: false, DraftJS: true, ProseMirror: false}`）。

此前三份外部资料互相矛盾（Lexical / DraftJS / ProseMirror），结论是：

- **DraftJS 那份（dev.to）方向正确** —— "清空连做两遍 + 分块写入"的依据在这里，已采纳「清空两遍」。
- **ProseMirror 那份（某 X 发帖 skill）不适用** —— 它声称「`insertText` 一把梭、换行全保留」，但那是 ProseMirror 的行为，不是 DraftJS 的。
- **StackOverflow 79666573** 的「只有合成 paste 能保住换行」可能是那个提问者版本下的结论，与 DraftJS 的 `handlePastedText` 路径有关，作为备选策略保留（策略 3）。
- **W3C 规范**「合成 paste 不会真的修改文档」仍然成立 —— 数据必须由页面自己的 paste handler 消费，所以我们只能派发事件、等编辑器自己回应。这正是**改动 1（等待异步）**存在的原因。

### 1.9 本次未做、但仍是候选方向

已落地：剪贴板兜底（作为**自动降级**，不再是主路径）、`selectAll`+`delete` 连做两遍。

尚未尝试：

1. **MAIN world 注入**：content script 跑在 isolated world，合成的事件与 `DataTransfer` 跨世界，X 的 handler 可能拿不到数据。改 `world: 'MAIN'` 再试（WXT 支持，manifest 里是 `"world": "MAIN"`）。
   **如果 1.12 实测发现四条策略全部落到 `copied` 兜底，这就是首选下一步。**
2. **分块写入**：按 dev.to 配方，20-30 字符一块、每块后校验，且不在一次 `insertText` 里带 `\n`。目前是整段一次写。
3. **DraftJS 内部 API**：若前两者都不行，考虑在 MAIN world 下拿 React fiber 上的 `editorState`（fiber 遍历找 `stateNode.editor`）直接 `EditorState.createWithContent()` 注入。**风险高**（依赖内部结构，X 一改版就崩），应作为最后手段。

### 1.10 别踩的坑

- ⚠️ **验收必须等到按钮状态稳定**：DraftJS 的 `onChange → React state → 按钮 disabled` 是异步链，**同步读到的必然是旧值**，会把已填好的结果判成失败。这是本次最关键的改动（1.6 改动 1）。
- ⚠️ **验收探针必须限定作用域**：详情页 + Reply Modal 时页面上有两个发帖按钮，不限定 scope 永远拿到上层那个禁用按钮（1.0.1）。
- ⚠️ **别再用 `textContent` 严格等值当验收**：编辑器真正换行节点的 `textContent` 里**没有** `\n`（`<br>` 不产生字符），严格比对会把"已经填好"误判为失败 → 触发降级 → 降级路径更糟。
- ⚠️ **别把"正确的写入结果"再清掉重填**：这是 `ef90ab9` 犯的错。
- ⚠️ **别在没拿到浏览器实测证据之前改代码** —— 这个 bug 已经纯靠推理绕了四轮，根因（编辑器类型 + 探针作用域）全靠 probe 实测才定下来。**推理四轮 = 零进展，一次 probe = 定位。**
- ⚠️ **只填入，绝不点击 Reply / Send / Post**（项目红线）。

### 1.11 涉及的探针（保留备用）

本次定位用的两个探针脚本已存进仓库，以后回归可复用：

- `docs/probe2.js` —— 编辑器身份确认（祖先链）、id 判定、**作用域对照**、四策略逐一实测（每测一条停 2.5s，期间手动按退格验证"能不能删"）。
- `docs/probe3.js` —— 50ms 轮询记录 `articles` / `dialogs` / `id` / 分支，用于抓瞬态 null（Bug 2 排查时用，已结案）。

### 1.12 验证步骤与实测结果

代码已改完并通过编译/构建。**2026-09-16 已实测过一轮**，结果见下表：

| 验收项 | 怎么判 | 实测结果 |
|---|---|---|
| 编辑器完全接管 | 填入后**手动按 Backspace 能删** | ⚠️ **部分** —— 提交后确实删了（数据对），但界面不刷新（S4，见 1.14） |
| 按钮点亮 | Console 里策略日志的 `填入后按钮可用: true` | 待核对日志 |
| 换行正确不多不少 | 帖子发出后与 composer 里逐字一致，含空行 | **部分通过** —— 提交后字符是真的 |
| 无句号错断行（S3） | 换行只出现在模型输出 `\n` 的位置 | 未核对 |
| 正文未被改动 | 标点 / emoji / 空格 / 全半角都不变 | 未核对 |
| 字符计数正确 | X 自己的计数 | 未核对 |

**下一步**：按 1.14 的步骤先确认**哪个策略被采纳**（Console 里 `策略被认账: true` 那条），再决定修 H1 / H2 / H3。

> ⚠️ **别因为 S4 的"界面没刷新"就把本次改动回退** —— 当前状态严格优于改之前：
> 文字进了编辑器状态、提交后数据正确；改之前是"提交后数据丢失"。**S4 是渲染问题，S2 是数据问题，前者轻得多。**

### 1.13 S3（句号被错误换行）——**尚未定位**

本次只处理了 S1 + S2，**S3 没动**（症状里说"待确认是哪一层"，还没确认）。

从代码看，最可疑的是发帖 prompt 的排版规则：

```
extension/prompts/post/head.md:80-82
* break the text into short lines (usually one sentence or one clause per line);
* separate groups of short lines with a blank line;
* a post may be 2-4 such chunks;
* inside the JSON text field, write every line break as the escape sequence \n
```

「**usually one sentence or one clause per line**」直接要求模型**每个句子后换行** ——
如果 S3 表现为"每个句号后都换行"，那**就是这条规则按字面生效了**，不是 bug 而是 prompt 设计问题。

**定位方法**：用 1.3 的三处对照。看 ① 面板候选卡片里是不是就已经"每句一行"：

- **① 就换错行** → 是上面这条 prompt 规则，去改 `head.md`（把"每句一行"改成分组表达）
- **① 对、② 错** → 才是 fill 的问题

**⚠️ 不要在没做三处对照之前改 prompt** —— 否则可能改掉一条本来正确的规则。

### 1.14 S4（退格"看着没删"、提交后确实删了）——**新，待排查**

**2026-09-16 21:30 用户实测（改完 fill.ts 之后）**：

> 现在填入发帖框之后，键盘点击 Backspace，**显示没有删除字符**，但是点击发送之后，**实际上字符是删除了的**。

#### 为什么这个症状是好消息（相比 S2 是明确的进步）

S2 和 S4 是**恰好相反**的故障，把它们并排看，能直接读出编辑器的状态：

| | 编辑器**状态** | 界面 (DOM) | 提交时用哪个 | 表现 |
|---|---|---|---|---|
| **S2**（改前） | **空** | 有字 | 状态 | 退格删不掉；提交后换行/文字全丢 |
| **S4**（改后） | **有字、且能被退格修改** ✅ | **不刷新** | 状态 | 退格看着没反应；**提交后确实是删过的** ✅ |

**关键推论：编辑器现在真的接管了文字**（状态里有内容，退格能作用于它，提交时按它序列化）。
这正是 1.6 那几处改动想达成的目标 —— **S2 治好了**。
剩下的 S4 是**纯渲染/同步问题**：状态更新了，但 DraftJS 没有把新状态重新渲染到 DOM 上。

#### 最可疑的成因（按可能性排序）

- **H1（最可疑）：我们派发的合成事件让 DraftJS 更新了 `EditorState`，但没触发它的重渲染。**
  DraftJS 的 `onChange` 链是 `EditorState` 变化 → `onChange(newState)` → React `setState` → 重渲染。
  若我们让它的**内部 state 变了却没走到 `onChange`**（或走了但 React 那次更新被丢弃/批处理吃掉），
  就会出现"状态新、界面旧"。**策略 2（合成 `beforeinput`）最像这一条** —— 它直接命中 DraftJS 的
  `editOnBeforeInput`，可能只改了状态没走完整提交流程。
- **H2：是我们"清空两遍"留下的后遗症。** `selectAll`+`delete` 连做两遍，
  第二遍可能在编辑器状态已经空之后再执行一次 delete —— 让 DOM 与状态从那一刻就错位，
  之后所有更新都建立在错位之上。
- **H3：`focus()` 的时机。** 写入前 `focus()`，但 DraftJS 的光标/选区可能没同步到它的状态里，
  于是它按"旧选区"渲染，而状态按"新选区"变化。

#### 下一步（按顺序）

1. **先确认是哪个策略被采纳的**：Console 过滤 `[x-copilot:fill]`，看哪一条的 **`策略被认账: true`**。
   日志里已带 `策略被认账 / 文字对得上 / 换行是真的 / 填入后按钮可用 / br数 / 子元素 / 片段`。
   - 若是 `2-合成beforeinput` → H1 基本坐实，**优先验它**
   - 若是别的 → 看 H2 / H3
2. **对比实验**（最快的判别法）：把**手打一小段字**和**填入**各做一次，然后都按 3 次退格，
   看界面刷新差异。手打正常、填入不正常 → 问题出在我们的写入方式（H1），而非编辑器本身。
3. **若 H1 成立**，两个候选修法：
   - **让 `beforeinput` 走完整流程**：不派发合成事件，改用 `document.execCommand('insertText', …)`
     并确认浏览器真的走了原生输入路径（策略 1 就是这个，比较两条的实际效果差异）。
   - **主动触发一次重渲染**：写入后对 composer 派发一次无副作用的 `input` 事件 /
     或轻微 `blur()`+`focus()`，逼 DraftJS 按当前 `EditorState` 重画。⚠️ 这属于"绕过"，可能有副作用，先小范围试。
4. **若都不行**，走 1.9 的方向 1（MAIN world 注入）—— 在 MAIN world 里我们与 DraftJS 同世界，
   交互路径更接近真实用户输入，H1 那类"跨世界事件被部分处理"的问题会自然消失。

> ⚠️ **S4 与 1.12 验收清单第 1 条直接冲突**（"Backspace 能删"看着不满足），
> 但**第 5 条（发出去与编辑器一致）反而是满足的**。验收时要分清这两条，别因为界面没刷新就把变化回退掉 ——
> **当前状态严格优于改之前**（至少数据是对的）。

---

## ✅ 二、[非 bug，已关闭] 详情页点评论图标会再次生成

**结论（2026-09-16 用户判定）**：**不是 bug，属合理行为**。点评论图标会打开一个新的回复上下文，重新生成一次可以接受，符合预期。**不再修复**，也不需要幂等保护。

### 排查留下的有效信息（供以后复用）

- **URL 确实会变**：打开详情页时 `pushState → /handle/status/<id>`；点评论图标弹窗时 URL 会**回落**（实测观察到 `popstate → /home`）。于是 `tweet-detector.ts` 从 URL 分支切到 `getReplyModalTweet()` 兜底分支，两条分支的 id 来源不同（`pathname` 里的数字 vs `href` 数字或 `modal-<hash>`）→ id 可能不一致 → 缓存未命中 → 重新生成。
  **这正好解释了当初"幂等保护为什么无效"**：`964cffd` 的 `inFlightIdRef` 判的是"同 id 在途则跳过"，而这里 id 根本不同，条件不成立。
- **另一条候选路径**：`tweet-detector.ts:200` 在 URL 仍指向推文、但 `articles.length === 0` 时返回 `null` → `App.tsx` 收到 null 后 `cancelGeneration()` 清空并取消；而在途结果因 `seq !== genSeqRef.current` 在 `cacheRef.set()` **之前**就 return，**永不入缓存** → 回来时缓存为空 → 重新生成。

两条路径都真实存在，但按判定属可接受行为，**不修**。

### ⚠️ 遗留的真实缺陷（与本 bug 无关，但同处代码，值得单独收）

`tweet-detector.ts` 的 `observe()` 清理不完整：`history.pushState/replaceState` 的包装**永不还原**、`popstate` 监听**永不移除**（`return () => observer.disconnect()` 只断开了 observer）。目前因为 App 的 detector effect 依赖稳定（依赖项都是 `useCallback`，空 deps）所以没发作；但 effect 一旦重建，就会多套一层 wrapper + 多一个常驻监听器。**建议以后顺手收掉。**

### 相关提交

- `a5de818` reply modal 检测（正常工作的部分，勿动）
- `ef87262` 检测加固 + `[X Copilot]` console.debug 日志
- `32c0441` null 确认期（保留中）
- `964cffd` 幂等保护（已回滚，不再需要）

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
