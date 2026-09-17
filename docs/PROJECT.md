# X Copilot

## 1. 项目定位

X Copilot 是一个面向 X（Twitter）用户的 Chrome Extension AI Copilot。

核心目标不是自动发帖机器人，而是：

> 在用户浏览 X 的过程中，降低“我想参与讨论，但不知道说什么”的认知成本。

第一阶段重点解决：

> 用户打开一个 Tweet → X Copilot 自动理解当前 Tweet → 生成多条不同风格的评论候选 → 用户点击候选 → 自动填入 X Reply 输入框 → 用户自行检查并发送。

**禁止自动发送。**

后续逐步扩展：

- AI 帖子生成
- 热点发现
- 值得评论的帖子推荐
- Bot / Spam / 色情引流内容识别
- Feed 清理
- 用户个人写作风格
- 内容表现分析

---

# 2. MVP 范围

第一版本只实现：

### 必须实现

1. Chrome Extension
2. X 页面识别
3. 当前 Tweet 识别
4. 获取 Tweet 文本及基础上下文
5. 悬浮球入口
6. 点击悬浮球打开 Copilot 侧面板
7. AI 生成 5 条评论
8. 评论具有不同风格
9. 点击评论后自动填入 Reply 输入框
10. **绝不自动发送**
11. 支持切换 Tweet 后重新识别
12. 支持重新生成
13. 基础错误处理
14. README + 本地运行说明

### MVP 暂不实现

- 自动点赞
- 自动关注
- 自动发送 Tweet
- 自动发送 Reply
- 自动批量评论
- 自动批量发帖
- 自动操作用户账号
- 热点爬虫
- Bot 检测
- 色情内容检测
- 用户账号系统
- 云端数据库
- 复杂数据分析

这些全部放到后续版本。

---

# 3. 核心产品原则

## 3.1 Copilot 而不是 Bot

X Copilot 负责：

> 理解 → 建议 → 填充

用户负责：

> 检查 → 修改 → 发送

任何情况下，插件都不能自动点击 X 的 Send / Post / Reply 按钮。

---

# 4. UI / UX

采用：

> **悬浮球 + 侧面板**

而不是永久显示侧面板。

## 4.1 默认状态

X 页面正常显示。

右侧出现一个小型悬浮按钮：

```text
                    ┌─────┐
                    │  ✦  │
                    └─────┘
```

悬浮球不应该遮挡 Tweet 内容。

需要支持：

- 固定位置
- 拖动
- 记忆用户最后位置
- 避免遮挡 X 主要按钮

---

# 5. Side Panel

点击悬浮球后打开右侧 Copilot Panel。

示意：

```text
┌───────────────────────────────────────┬───────────────────┐
│                                       │ X Copilot     ×   │
│                                       ├───────────────────┤
│                                       │                   │
│              X Timeline               │ 💬 Reply          │
│                                       │                   │
│              Current Tweet            │ 关于这条 Tweet    │
│                                       │ 的评论建议：      │
│                                       │                   │
│                                       │ ┌───────────────┐ │
│                                       │ │ ① 观点       │ │
│                                       │ │               │ │
│                                       │ │ xxx xxx xxx   │ │
│                                       │ │               │ │
│                                       │ │ [填入]        │ │
│                                       │ └───────────────┘ │
│                                       │                   │
│                                       │ ┌───────────────┐ │
│                                       │ │ ② 补充       │ │
│                                       │ │ xxx xxx xxx   │ │
│                                       │ │               │ │
│                                       │ │ [填入]        │ │
│                                       │ └───────────────┘ │
│                                       │                   │
│                                       │ [重新生成]        │
└───────────────────────────────────────┴───────────────────┘
```

Panel 宽度建议：

> 320～400px

不要过宽。

---

# 6. 评论生成

默认生成 5 条。

建议默认包含：

1. 观点型
2. 补充型
3. 反向观点
4. 简短型
5. 水贴 / 轻量互动型

例如：

```text
① 观点

真正值得关注的可能不是这个 benchmark，
而是后面实际落地时的成本变化。

② 补充

如果这个趋势继续下去，AI infra 这条线可能
还会持续受益。

③ 反向

我反而觉得这个数据本身没那么重要，
真正关键的是生产环境表现。

④ 简短

这条线今年是真的停不下来。

⑤ 水贴

越来越卷了。
```

具体文本由 LLM 生成。

---

# 7. 评论生成要求

生成内容必须：

- 自然
- 简洁
- 像真实 X 用户
- 避免 ChatGPT 腔
- 避免模板化表达
- 避免无意义套话
- 不强制使用 emoji
- 不强制使用英文
- 根据原 Tweet 语言生成
- 不要重复原 Tweet

避免：

```text
这是一个非常有趣的发展，值得进一步关注。
```

避免：

```text
This is a fascinating development and it will be
interesting to see how this plays out.
```

除非用户明确要求，否则不要出现这种明显 AI 腔。

---

# 8. Tweet Context

Content Script 需要尽可能提取当前 Tweet：

```typescript
interface TweetContext {
  id?: string;
  url?: string;
  author?: string;
  authorHandle?: string;
  text: string;
  timestamp?: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quotedTweet?: TweetContext;
}
```

MVP 最低要求：

```text
text
author
authorHandle
url
id
```

如果某字段无法可靠获取，不应该导致整个功能失败。

---

# 9. X DOM 适配

X 是动态 SPA。

不能依赖页面刷新重新初始化。

必须考虑：

- Timeline 无限滚动
- URL 不刷新
- Tweet 页面切换
- Modal
- Reply Modal
- Quote Tweet
- Compose
- DOM 动态变化

建议使用：

```text
MutationObserver
```

监听页面变化。

同时监听：

```text
window.location
```

或通过 history API / URL polling 判断当前 Tweet 是否发生变化。

---

# 10. 当前 Tweet 判断

当用户打开：

```text
/x/status/123456
```

识别为当前 Tweet。

当用户在 Timeline 中点击某个 Tweet：

```text
Timeline
   ↓
Tweet Modal / Detail
   ↓
重新识别当前 Tweet
```

不要只根据 URL 判断。

因为 X 存在大量动态 DOM 场景。

应建立：

```typescript
TweetDetector
```

接口：

```typescript
interface TweetDetector {
  getCurrentTweet(): TweetContext | null;

  observe(
    callback: (tweet: TweetContext | null) => void
  ): () => void;
}
```

---

# 11. Reply Input 检测

需要实现：

```typescript
findReplyComposer(): HTMLElement | null
```

识别 X 当前 Reply 输入框。

X 的输入框可能是：

```html
<div contenteditable="true">
```

不能假设固定 className。

优先使用：

- aria-label
- role
- data-testid
- contenteditable
- DOM 层级关系

等相对稳定的属性。

所有 X DOM Selector 必须集中管理。

不要把 selector 散落在整个项目里。

建议：

```text
lib/content/x/
├── selectors.ts
├── tweet-detector.ts
├── composer-detector.ts
└── fill.ts
```

---

# 12. Fill Reply

用户点击：

```text
[填入]
```

插件：

1. 找到当前 Reply composer
2. focus
3. 写入评论
4. 触发必要的 input / beforeinput / change 等事件
5. 保持 X UI 正常识别内容

**禁止：**

```text
点击 Reply
点击 Send
点击 Post
```

只能：

> 填入输入框。

如果找不到 composer：

显示：

```text
未找到评论输入框，请先点击 Reply。
```

---

# 13. LLM API

第一版采用 Provider 抽象，不要把某一个模型写死。

定义：

```typescript
interface LLMProvider {
  generateReplies(
    context: TweetContext,
    options?: GenerateReplyOptions
  ): Promise<ReplyCandidate[]>;
}
```

返回：

```typescript
interface ReplyCandidate {
  id: string;
  style: string;
  text: string;
}
```

例如：

```json
{
  "id": "1",
  "style": "观点",
  "text": "真正值得关注的可能不是..."
}
```

---

# 14. Backend

> ⚠️ 本节为**初版设想**，实际实现**未采用独立后端**：扩展直接调用 OpenAI 兼容的模型 Endpoint（详见 `docs/ARCHITECTURE.md` §1 技术栈与 §2 D2）。下方结构图仅供参考，仓库内不存在 `backend/` 目录。

第一版可以采用：

```text
Chrome Extension
        ↓
Backend API
        ↓
LLM Provider
```

不要把真实 API Key 直接硬编码到 Chrome Extension。

建议：

```text
backend/
├── main.py
├── api/
│   └── generate.py
├── llm/
│   ├── base.py
│   ├── openai.py
│   └── ...
├── prompts/
│   └── reply.py
└── config.py
```

如果为了 MVP 开发效率，也允许提供：

> Extension 直接调用兼容 OpenAI API 的 Endpoint

但必须通过配置实现，不要把 Provider 写死。

---

# 15. API

MVP：

```http
POST /api/reply/generate
```

Request：

```json
{
  "tweet": {
    "id": "123",
    "text": "...",
    "author": "xxx",
    "authorHandle": "@xxx",
    "url": "https://x.com/xxx/status/123"
  },
  "count": 5
}
```

Response：

```json
{
  "replies": [
    {
      "id": "1",
      "style": "观点",
      "text": "..."
    },
    {
      "id": "2",
      "style": "补充",
      "text": "..."
    }
  ]
}
```

---

# 16. Prompt

Prompt 不应该散落在业务代码中。

统一放：

```text
backend/prompts/
```

第一版 Reply Prompt 的核心要求：

```text
You are an assistant helping a user participate naturally
in conversations on X.

Given the current Tweet, generate several possible replies.

Requirements:

1. Replies should sound like natural human posts on X.
2. Do not simply restate the original Tweet.
3. Avoid generic AI phrases.
4. Keep replies concise.
5. Each reply should have a distinct angle.
6. Preserve the language of the original Tweet.
7. Do not claim facts that are not supported by the Tweet.
8. Do not automatically send anything.
9. Return structured JSON.
```

后续再加入用户个人风格。

---

# 17. Extension 项目结构

推荐：

```text
x-copilot/
│
├── extension/
│   ├── entrypoints/
│   │   ├── background.ts
│   │   └── x.content.tsx
│   ├── components/          # React UI（渲染进 Shadow DOM）
│   │   ├── App.tsx
│   │   ├── FloatingButton.tsx
│   │   ├── Panel.tsx
│   │   ├── ReplyCard.tsx
│   │   └── styles.ts
│   ├── lib/
│   │   ├── content/x/       # X 页面侧：识别 / 写入 / 清理
│   │   │   ├── selectors.ts
│   │   │   ├── tweet-detector.ts
│   │   │   ├── composer-detector.ts
│   │   │   └── fill.ts
│   │   ├── llm/             # 服务商适配 / 流式 / 提示词
│   │   └── config.ts
│   ├── prompts/             # 提示词模板（Markdown，构建期内联）
│   ├── public/              # 设置页（静态 HTML + JS）
│   ├── types/
│   ├── wxt.config.ts
│   └── package.json
│
├── backend/                # （初版设想，未实现；实际无独立后端，见 ARCHITECTURE.md）
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── llm/
│   │   ├── prompts/
│   │   └── models/
│   ├── requirements.txt
│   └── .env.example
│
├── docs/
│   ├── PROJECT.md
│   └── ARCHITECTURE.md
│
├── .gitignore
└── README.md
```

如果 Coding Agent 认为某种技术栈更适合，可以调整，但必须保持：

> Extension / Backend / LLM Provider / X Adapter

四层概念分离。

---

# 18. 状态管理

MVP 不需要复杂状态管理。

核心状态：

```typescript
interface CopilotState {
  currentTweet: TweetContext | null;
  isPanelOpen: boolean;
  isGenerating: boolean;
  replies: ReplyCandidate[];
  error?: string;
}
```

后续再考虑 Zustand 等。

---

# 19. 错误处理

所有错误必须用户可理解。

例如：

### LLM 错误

```text
生成失败，请稍后重试。
```

### API 错误

```text
无法连接到 X Copilot 服务。
```

### 没有 Tweet

```text
暂时没有识别到当前 Tweet。
```

### 没有 Reply Composer

```text
请先点击 Reply，再尝试填入。
```

### X 页面结构发生变化

不要让插件整体崩溃。

---

# 20. 性能要求

不要每次 DOM mutation 都调用 LLM。

必须：

```text
DOM mutation
    ↓
debounce
    ↓
判断 Tweet 是否真正变化
    ↓
变化才更新状态
```

相同 Tweet 不重复请求。

可以使用：

```typescript
Map<string, ReplyCandidate[]>
```

作为简单 session cache。

例如：

```text
Tweet ID
   ↓
缓存
   ↓
已有结果 → 直接显示
```

---

# 21. 安全原则

第一版必须遵守：

- 不保存 X 登录 Cookie
- 不读取密码
- 不自动发送内容
- 不自动点赞
- 不自动关注
- 不模拟用户批量操作
- 不绕过 X 验证机制
- API Key 不写入 Git
- `.env` 加入 `.gitignore`

---

# 22. 后续版本规划

## Phase 2：Post Copilot

用户打开 X Copilot：

```text
✍️ Generate Post
```

读取：

- 当前 Tweet
- 当前页面若干高互动 Tweet
- 用户指定主题

生成：

```text
观点型
反向型
热点型
短帖
Thread 开头
```

点击：

```text
[填入]
```

自动填入 X Compose。

仍然：

> 不自动发送。

---

# 23. Phase 3：Trend Radar

增加：

```text
🔥 Trends
```

发现：

- 当前热点
- 快速升温话题
- 高互动 Tweet
- 用户关注领域中的热点

展示：

```text
🔥 NVIDIA
热度：★★★★★
增长：↑↑↑

适合：
[观点]
[蹭热点]
[短帖]
```

---

# 24. Phase 4：Engage Assistant

在 Timeline 中自动识别：

> 哪些 Tweet 值得用户参与。

例如：

```text
🔥 推荐互动

原因：
- 高互动
- 与你的兴趣相关
- 讨论正在快速增长
```

用户点击：

```text
生成评论
```

---

# 25. Phase 5：Feed Cleaner

加入：

```text
🛡 Clean
```

识别：

- Bot
- Spam
- 重复内容
- 色情引流
- 诈骗
- 赌博引流
- 广告
- 低质量 AI 批量账号

处理方式：

```text
Tweet
 ↓
Classifier
 ↓
Spam probability
 ↓
用户设置
 ↓
隐藏 / 显示
```

默认建议：

> AI 判断 → 隐藏内容

但保留：

```text
显示
为什么隐藏？
永远隐藏此类内容
```

不要直接封禁账号。

---

# 26. Phase 6：Personal Style

分析用户自己的历史 Tweet。

提取：

```text
语言
句子长度
常用词
语气
emoji 使用
观点表达方式
是否喜欢反问
是否喜欢数字
常见主题
```

形成：

```typescript
interface UserWritingStyle {
  language: string;
  tone: string;
  sentenceLength: string;
  commonPatterns: string[];
  avoidPatterns: string[];
}
```

生成内容时：

```text
Tweet Context
      +
User Writing Style
      ↓
LLM
      ↓
更接近用户本人风格的内容
```

---

# 27. 产品定位演进

最终产品不是：

> AI Tweet Generator

而是：

> **X Copilot**

定位：

```text
                         X Copilot
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
       CREATE             DISCOVER             CLEAN
          │                  │                  │
       发帖/评论           热点/互动             Feed清理
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                         Personal AI
```

核心理念：

> **Help users create, discover and navigate X more efficiently.**

---

# 28. 第一阶段开发任务

Coding Agent 应按照以下顺序实施。

### Task 1

初始化 Extension 项目。

验收：

```text
npm install
npm run build
```

能够成功生成 Extension。

---

### Task 2

实现 X Content Script。

打开：

```text
https://x.com/
```

能够正常注入。

不能破坏 X 原有页面。

---

### Task 3

实现 TweetDetector。

要求：

```typescript
getCurrentTweet()
```

能够识别当前 Tweet。

---

### Task 4

实现 Floating Button。

要求：

- 默认显示
- 不遮挡核心 UI
- 可点击
- 可拖动
- 位置持久化

---

### Task 5

实现 Side Panel。

点击：

```text
✦
```

打开 Panel。

再次点击关闭。

---

### Task 6

连接 `/api/reply/generate`。

点击：

```text
Generate
```

显示 loading：

```text
正在生成……
```

然后显示 5 条候选。

---

### Task 7

实现 Fill Reply。

点击：

```text
[填入]
```

文字进入 X Reply composer。

**不得发送。**

---

### Task 8

实现 Tweet 切换检测。

从：

```text
Tweet A
```

切换到：

```text
Tweet B
```

Panel 自动更新。

---

### Task 9

加入 Cache。

相同 Tweet 重复打开时：

> 优先使用已有生成结果。

---

### Task 10

完善 README。

必须包含：

```text
项目介绍
技术架构
环境要求
安装依赖
配置 API
启动 Backend
Build Extension
Chrome 加载方式
常见问题
```

---

# 29. MVP 验收测试

必须人工测试以下场景：

### Case 1

打开 Tweet Detail。

预期：

```text
识别成功
```

### Case 2

打开 Timeline 中 Tweet。

预期：

```text
能够识别
```

### Case 3

点击悬浮球。

预期：

```text
Panel 打开
```

### Case 4

点击 Generate。

预期：

```text
生成 5 条评论
```

### Case 5

点击 Fill。

预期：

```text
评论进入 Reply 输入框
```

### Case 6

确认：

```text
X 没有自动发送
```

### Case 7

切换 Tweet。

预期：

```text
Current Tweet 更新
```

### Case 8

连续快速滚动 Timeline。

预期：

```text
页面不明显卡顿
没有大量 API 请求
没有重复插入 Copilot UI
```

### Case 9

LLM API 失败。

预期：

```text
显示友好错误
插件不崩溃
```

### Case 10

X DOM 结构无法识别。

预期：

```text
Copilot 保持可用
提示无法识别当前 Tweet
```

---

# 30. Coding Agent 工作规则

实现过程中遵循以下原则：

1. **先实现 MVP，不提前实现 Phase 2～6。**
2. 不为了“未来可能用到”而过度工程化。
3. 但必须保留 LLM Provider abstraction。
4. X DOM 相关代码必须与 UI、LLM 解耦。
5. 所有 selector 集中管理。
6. 不自动发送任何内容。
7. 不修改 X 原有核心逻辑。
8. 不使用用户账号 Cookie。
9. 优先保证实际可运行，而不是追求漂亮架构。
10. 每完成一个 Task 都进行实际 build/test。
11. 遇到 X DOM 不确定时，优先通过实际浏览器测试确认，不要猜 selector。
12. 如果发现当前 X 页面结构与假设不一致，应调整 `x/` adapter，而不是污染业务层。
13. 保持后续可以增加 Post / Trend / Clean 模块。

---

# 31. Definition of Done

当以下流程可以稳定运行时，MVP 即完成：

```text
打开 Chrome
    ↓
进入 X
    ↓
打开一个 Tweet
    ↓
看到 ✦ X Copilot
    ↓
点击 ✦
    ↓
打开 Side Panel
    ↓
点击 Generate
    ↓
得到 5 条不同风格评论
    ↓
选择一条
    ↓
点击「填入」
    ↓
X Reply 输入框出现文字
    ↓
用户自行修改
    ↓
用户自行点击 Reply
```

最终必须满足：

> **整个流程中，只有用户本人可以发送内容。**

---

# 32. 第一版不要做的事情

特别强调：

不要现在实现：

```text
❌ 自动发帖
❌ 自动评论
❌ 自动点赞
❌ 自动关注
❌ 批量账号操作
❌ 自动刷互动
❌ 自动注册账号
❌ 绕过 X 限制
❌ Botnet
❌ 大规模自动化操作
```

X Copilot 第一阶段的核心价值只有一个：

> **让用户更容易、更快地完成自己的 X 内容创作。**