# X Copilot 架构与技术方案

> 本文是 `PROJECT.md` 的技术补充，记录已确认的选型与实现决策。与 PROJECT.md 冲突时，以本文为准（仅限技术选型层，产品红线不变）。

---

## 1. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 构建工具链 | **WXT**（Vite 生态的 Extension 框架） | 自动处理 manifest、HMR、content script 注入；不手搓 manifest + esbuild |
| UI 栈 | **React 18 + TypeScript** | Panel 与悬浮球渲染进 Shadow DOM，样式天然与 X 隔离 |
| LLM 接入 | **DeepSeek API（OpenAI 兼容协议）** | `https://api.deepseek.com`，模型默认 `deepseek-flash`；走 background service worker fetch。因协议 OpenAI 兼容，Provider 抽象保留，后续可无缝切到自建 backend 或其他模型 |
| Backend | 第一版**不实现** | DeepSeek endpoint + API key 放 Options 页，存 `chrome.storage.local`，绝不硬编码进代码 |
| 状态管理 | 原生 state + `chrome.storage.session` | MVP 不引入 Zustand（与 PROJECT.md §18 一致） |

### Manifest V3 权限清单（最小化）

```json
{
  "permissions": ["storage"],
  "host_permissions": [
    "https://x.com/*",
    "https://api.openai.com/*"
  ]
}
```

不申请 `tabs`、不申请 `<all_urls>`。若 LLM endpoint 可配置，host_permissions 需用 `optional_host_permissions` + 动态申请，Options 页保存时处理。

### DeepSeek 接入参数（默认值）

```text
base_url: https://api.deepseek.com        # /v1/chat/completions，OpenAI 兼容
model:    deepseek-flash                  # 默认；deepseek-v4-pro 为备选（更强但更贵更慢，回复生成不需要）
api_key:  用户自备，存 chrome.storage.local
response: 强制 JSON 输出（response_format: { type: "json_object" }）
```

回复生成是短文本任务，`deepseek-flash` 足够；temperature 建议 0.9~1.1 区间以保证 5 条候选的风格差异性。模型名以 https://api-docs.deepseek.com/zh-cn/ 为准。

---

## 2. 关键架构决策

### D1：Panel 采用「注入式 + Shadow DOM」，不用原生 chrome.sidePanel

| | 注入式 Panel（选定） | chrome.sidePanel API |
|---|---|---|
| 与 PROJECT.md UI 图一致性 | ✅ 完全一致 | 布局受浏览器控制 |
| 悬浮球开关 Panel | 同一 content script 内直接 setState | 需绕 background 转发消息 |
| Tweet 切换更新 | 零跨上下文通信 | 需要 port 通信 |
| 状态持久性 | 页面刷新丢失（可接受） | 浏览器级持久 |
| 兼容性 | 全版本 | Chrome 114+ |

状态全部收敛在 content script 一层，是 MVP 通信成本最低的方案。

### D2：状态归属

```
content script（页面级，唯一持有运行时状态）
├── currentTweet: TweetContext | null
├── isPanelOpen / isGenerating
├── replies: ReplyCandidate[]
└── session cache: Map<tweetId, ReplyCandidate[]>

chrome.storage.session（SW 重启不丢，浏览器关闭即清）
└── cache 的持久副本（可选优化）

background service worker（无状态）
└── 只做一件事：代理 LLM API 请求（解决 CORS + 保护 key 不出现在页面上下文）
```

**请求必须从 background SW 发出**，不允许 content script 直接 fetch 外部 API——这是 PROJECT.md 未明说但必须遵守的规则。

### D3：TweetDetector —— URL 主判 + DOM 字段提取

X 打开 Tweet（包括从 Timeline 点开 Modal）都会 pushState 更新 URL，因此：

- **判断"当前是哪条 Tweet"**：解析 URL `/^\/[^/]+\/status\/(\d+)/`（含 Modal 场景），URL 无 status 时清空 currentTweet
- **提取字段**：在当前 Tweet 的 `article[data-testid="tweet"]` 内取 `author`、`[data-testid="tweetText"]`、互动数（aria-label）
- 监听：MutationObserver（debounce 300ms）+ 对 `location.href` 的轮询/patched pushState 检测
- **DOM 只负责字段抽取，不负责判定当前 Tweet**。某字段提取失败返回 undefined，不抛错、不阻断（PROJECT.md §8）

### D4：Fill Reply 策略（全项目最高风险项）

X Reply 输入框是 contenteditable + 自研编辑器，禁止用 `innerText` 赋值。实现顺序：

1. `composer.focus()`
2. 优先 `document.execCommand('insertText', false, text)`（对 X 编辑器兼容性最好）
3. 失败则降级派发 `InputEvent('beforeinput')` + `{ inputType: 'insertText' }`
4. 填入后校验：读回 composer 内容确认写入成功，失败则报错提示用户手动粘贴

**Task 0 spike 必须最先验证此环节**（见 §4），验证不过则整个产品价值不成立。

### D5：Selector 集中管理

所有 X DOM selector 只存在于 `src/content/x/selectors.ts`，其余模块通过语义化引用。selector 失效只改这一个文件。

### D6：Options 页为 `public/options.html` 静态实现（原生 JS，无 React）

Options 页只有三个输入框 + 保存，没有构建必要。更关键的原因：**项目路径含非 ASCII 字符（如 `开发项目`）时，Vite 的 HTML 入口（multipage build）不产出 HTML 文件**，而 JS 入口不受影响（WXT 0.19.29 + Vite 6.4.3 实测复现，ASCII 路径下同代码一次通过）。因此：

- 所有 entrypoints 保持纯 JS/TS 入口（background、content script），HTML 一律放 `public/` 由 Vite 原样拷贝
- Options 页用内联原生 JS 直接读写 `chrome.storage.local`
- 注意：WXT 会把 `entrypoints/` 顶层的裸 `.ts/.tsx` 当作 unlisted 入口并在构建期执行模块，非入口脚本必须放在 `entrypoints/` 之外（如 `components/`）
- 若未来必须新增构建型 HTML 页面，在中文路径下需通过 ASCII 路径 junction 目录构建

---

## 3. 模块结构

```text
x-copilot/
├── extension/                  # WXT 项目根
│   ├── entrypoints/
│   │   ├── background.ts       # LLM 请求代理（无状态）
│   │   └── x.content.tsx       # 注入入口：悬浮球 + Panel + Detector
│   ├── components/             # React 组件（渲染进 Shadow DOM）
│   │   ├── App.tsx
│   │   ├── FloatingButton.tsx
│   │   ├── Panel.tsx
│   │   ├── ReplyCard.tsx
│   │   └── styles.ts           # Shadow DOM 内联样式
│   ├── lib/
│   │   ├── content/x/
│   │   │   ├── selectors.ts        # 唯一 selector 源
│   │   │   ├── tweet-detector.ts   # D3
│   │   │   ├── composer-detector.ts
│   │   │   └── fill.ts             # D4
│   │   ├── llm/
│   │   │   ├── provider.ts         # LLMProvider 接口
│   │   │   └── openai-compat.ts    # OpenAI 兼容实现（DeepSeek 即此协议）
│   │   └── config.ts               # DeepSeek 默认配置
│   ├── public/
│   │   └── options.html            # Options 页（静态，见 D6）
│   ├── types/
│   ├── wxt.config.ts
│   └── package.json
└── docs/
    ├── PROJECT.md
    └── ARCHITECTURE.md
```

四层分离不变：**UI（components） / X Adapter（content/x） / LLM Provider（llm） / 传输层（background）**。UI 不 import X DOM 模块，X Adapter 不知道 LLM 的存在。

---

## 4. 开发任务顺序（修订版）

在 PROJECT.md §28 基础上插入 Task 0，其余顺序不变：

| # | 任务 | 验收 |
|---|---|---|
| **0** | **Spike：无头验证 fill composer** | 在真实 x.com Reply 输入框写入文字且 X 识别（出现内容、Reply 按钮激活），不发送 |
| 1 | WXT 脚手架 + build 通过 | `npm run build` 产出可加载的 extension |
| 2 | Content script 注入 x.com | 注入成功，不影响 X 页面 |
| 3 | TweetDetector | 打开任意 Tweet 能取到完整 TweetContext |
| 4 | FloatingButton（拖动 + 位置持久化） | 不遮挡核心 UI |
| 5 | Panel 开关 | 点球开、再点关 |
| 6 | 接通 LLM 生成 5 条回复 | loading → 5 条风格候选 |
| 7 | Fill Reply（用 Task 0 结论） | 文字进 composer，绝不发送 |
| 8 | Tweet 切换检测 | Panel 自动更新 |
| 9 | session cache | 同 Tweet 不重复请求 |
| 10 | README + Options 页（endpoint/key 配置） | 按 PROJECT.md §28 Task 10 清单 |

---

## 5. 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| X 编辑器不接受注入文本 | 🔴 高 | Task 0 最先验证；降级方案：填入失败时把文本复制到剪贴板并提示 |
| X 改版 selector 失效 | 🟡 中 | selector 集中管理；提取失败只降级不崩溃（PROJECT.md §19） |
| API key 泄露 | 🟡 中 | key 只存 `chrome.storage.local`、只在 SW 中使用、不写日志 |
| Tweet 文本发送给第三方 LLM | 🟡 中 | README 明确披露；Options 页展示当前 endpoint 域名 |
| MV3 SW 休眠 | 🟢 低 | SW 无状态设计，缓存放 content script / storage.session |
| 频繁 regenerate 费用 | 🟢 低 | 前端节流，MVP 不做配额 |

---

## 6. 不做的事（继承 PROJECT.md 红线）

不自动发送/点赞/关注、不批量操作、不碰用户 Cookie、不绕过 X 验证、不模拟点击任何 Send 类按钮。**只有用户本人可以发送内容。**
