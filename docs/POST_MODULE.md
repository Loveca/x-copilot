# Post Copilot 模块（Phase 2）

> 需求来源：`PROJECT.md` §22（仓库根目录）。技术选型见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 0. 进度表（2026-09-15 冻结）

**当前状态：进行中**（2026-09-15 从 Clean 模块回到此处，CLEAN 已暂停）。继续时从 M2 开始；下方为本次新增的「发帖入口自动弹面板」行为。

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M0** | Spike：主发帖框检测 + 写入 + X 认账验证 | ✅ 通过（首页时间线、弹窗内两种变体都 OK，Post 按钮正常激活） |
| **M1** | 模式切换 + 三输入源 + 发帖风格（内置默认）+ 发帖 Prompt + 填入主发帖框 | ✅ 完成 |
| **M2** | 设置页「发帖风格」分区（排序 / 数量 / 开关） | ⬜ 待做（当前用内置默认 5 种各 1 条） |
| M3 | 高互动 Tweet 抓取口径收紧（只取关注的人？取几条？可开关？） | ⬜ 待做 |
| — | 润色草稿 / 完整 Thread 生成 | ❌ 明确不做（不在 spec 内，用户已决定） |

**已验证可用**：首页时间线发帖框写入、弹窗内发帖框写入、长文本输入框随内容增高、模式切换不回弹。

**发帖入口自动弹面板（2026-09-15 新增）**：给 content script 加 `focusin` 监听——聚焦到主发帖框（首页内联「What's happening?」框 / 点右侧「发帖」FAB 打开的弹窗框，且不是回复框）时，自动打开面板并切到发帖模式；**不自动生成**，等用户手动点「生成帖子」。详情页/回复弹窗（`tweetRef` 有值）下不抢回复模式的面板。实现见 `components/App.tsx` 的 focusin effect。

**已知限制（有意保留）**：
- 已识别到具体推文（详情页 / 回复弹窗）时「发帖」置灰且点击无反应——详情页没有发帖入口。若将来能自动打开 X 的发帖弹窗可放开
- 发帖风格仍为内置默认，不可配置（M2）
- 只有回复框可见时 `findPostComposer()` 返回 null，不会用回复框凑数

**回来继续时的入口**：`components/App.tsx`（mode / modeRef / runGenerate）、`lib/llm/openai-compat.ts`（`buildPostPrompt` / `resolveGeneration`）、`lib/config.ts`（`DEFAULT_POST_STYLES` / `activePostStyles`）。

---

## 1. 需求原文（PROJECT.md §22）

```text
✍️ Generate Post

读取：
  - 当前 Tweet
  - 当前页面若干高互动 Tweet
  - 用户指定主题

生成：
  观点型 / 反向型 / 热点型 / 短帖 / Thread 开头

点击 [填入] → 自动填入 X Compose。仍然：不自动发送。
```

产品定位（`PROJECT.md` §1）：**降低"我想参与讨论，但不知道说什么"的认知成本**；后续扩展里的第一项就是「AI 帖子生成」。

红线不变（`PROJECT.md` §32 / ARCHITECTURE.md §6）：不自动发帖、不自动评论、不自动点赞关注、不批量操作。**只有用户本人可以发送内容。**

## 2. 与回复模块的差异

| 维度 | 回复生成（Phase 1） | Post Copilot（Phase 2） |
|---|---|---|
| 内容来源 | 当前 Tweet（必须有） | 用户主题 / 当前 Tweet / 页面高互动 Tweet（**可以完全没有推文**） |
| 目标输入框 | Reply composer | **主 Compose 发帖框** |
| 风格体系 | 观点 / 补充 / 反向 / 简短 / 水贴（回应别人） | 观点型 / 反向型 / 热点型 / 短帖 / Thread 开头（表达自己） |
| Prompt | 严格贴合原推，不复述 | 无原推约束，需要自己立论 |

**两套风格必须分开配置**：`回复风格` 与 `发帖风格` 是不同维度，不能复用同一份配置。

## 3. 可复用 vs 需新建

**直接复用**：悬浮球 + Panel、流式生成与逐条渲染、会话缓存、`fill.ts` 的合成 paste 写入策略、设置页分区架构、风格配置的数据模型（排序 / 数量 / 开关）、Provider 的 400 降级与图片能力。

**需要新建**：

| 工作 | 风险 | 状态 |
|---|---|---|
| 主 Compose 检测 + 填入 | 🔴 高 | M0 Spike 中 |
| 面板「回复 / 发帖」模式切换 | 🟡 中 | 未开始 |
| 发帖 Prompt + 发帖风格配置 | 🟢 低 | 未开始 |
| 高互动 Tweet 抓取 | 🟡 中 | 未开始 |
| Thread 开头 / 完整 Thread | 🟢 低 | 未开始（spec 只要求"Thread 开头"一条） |

## 4. M0 Spike：主发帖框能不能通

**为什么先做这个**：回复模块当年把「无头验证 fill composer」排在所有任务之前（ARCHITECTURE §4 Task 0）。主发帖框的检测与写入是 Phase 2 最高风险项——X 有多种 composer（首页时间线、Modal、引用、回复），它们共用同一个 `tweetTextarea_*` testid；而且只把文字塞进 DOM 不算成功，**必须让 X 自己的状态更新**（Post 按钮从 disabled 变可用）。通不过这一步，后面全是空中楼阁。

**结果：已通过（2026-09-15）**。首页时间线发帖框与弹窗内发帖框两种变体都验证成功，填入后 X 的 Post 按钮正常激活。

**已实现**：

- `selectors.ts`：新增 `postComposer`、`postButton`、`POST_COMPOSER_KEYWORDS`
- `composer-detector.ts`：`findPostComposer()` 按「排除回复框 → 弹窗内优先 → aria-label 像 Post text → 兜底第一个」的顺序判定；`isPostButtonEnabled()` 用于判断 X 是否认账
- `fill.ts`：`fillComposer`（与 `fillReplyComposer` 同一套策略，去掉 reply 限定）
- 面板：开发者选项打开时多一个「Spike：测试填入主发帖框」按钮，结果通过 toast + Console 的 `[X Copilot] post composer spike` 输出

**验证步骤**：

1. 设置页 → 插件信息 → 开发者选项 → 打开「显示生成耗时信息」
2. 打开 x.com **首页**（时间线上有发帖框）
3. 点悬浮球打开面板 → 点「Spike：测试填入主发帖框」
4. 看结果：
   - toast 「已填入，Post 按钮已激活」→ ✅ Spike 通过
   - toast 「文字进去了，但 Post 按钮仍禁用」→ ⚠️ DOM 成功但 X 状态没更新，需要换写入策略
   - toast 「未找到主发帖框」→ 选择器需要调
5. 另外在**点开发帖弹窗**的状态下再测一次（弹窗内的 composer 是另一个变体）
6. 测试完记得删掉那句测试文字

Console 里会打出 `testId` / `ariaLabel` / `filled` / `postButtonBefore` / `postButtonAfter`，排查时把这行发出来最省事。

## 5. M1：Post Copilot v1（已实现）

- **模式切换**：面板顶部「回复 / 发帖」分段控件。检测规则：识别到推文 → 回复模式；时间线上没有具体推文 → 发帖模式。手动切换会清空上一模式的结果（回复候选与发帖草稿不能混）
- ⚠️ **已识别到具体推文时「发帖」直接置灰、点击无反应**（详情页 / 回复弹窗）。理由：详情页没有发帖入口，在这里谈"写自己的帖子"在交互上是断裂的——先这样收敛，等有更合理的逻辑（比如自动打开 X 的发帖弹窗）再改
- **三种输入源全部接上**（按用户选择）：
  - 用户主题：复用意图输入框
  - 当前 Tweet：作为**灵感**（prompt 里明确写了"不要回复它，写一条独立的帖子"）
  - 页面高互动 Tweet：`collectTimelineTweets(5)` 扫描当前页面可见帖子，按 点赞+回复+转推 排序取前 5 条
- **发帖风格**：`uiConfig.postStyles` 独立配置（观点型 / 反向型 / 热点型 / 短帖 / Thread 开头），与 `styles` 完全分离
- **生成**：`GenerateOptions.mode = 'reply' | 'post'`，provider 按模式选 prompt（回复强调贴合原推，发帖强调自己立论、不许编造用户没给的事实）
- **填入**：发帖模式用 `findPostComposer()` + `fillComposer()` 写主发帖框；回复模式仍走原来的回复框
- **缓存键带模式**：`模式::tweetId::意图`，避免同一条推文的回复结果与发帖草稿互相覆盖

## 6. 下一步（M2）

- **设置页「发帖风格」分区**：目前发帖风格用内置默认值，还不能像回复风格那样排序 / 调数量 / 开关
- 高互动 Tweet 抓取的口径再收紧（是否只取关注的人、是否可开关、默认取几条）

## 7. 待验证后再定

- 首页时间线发帖框 vs 弹窗内发帖框，是否需要分别处理
- 高互动 Tweet 的抓取口径：取可见的几条、按什么排序、取多少条、是否默认开启
- 「润色我已写的草稿」（读取作曲框内容再改写）不在 spec 内，本次**不做**
- 完整 Thread 生成（多条带编号）不在 spec 内（spec 只要求"Thread 开头"），本次**不做**
