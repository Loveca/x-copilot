# 回复生成模块

> 本文记录「回复生成」模块截至当前的全部功能边界与实现要点。产品需求见 [PROJECT.md](./PROJECT.md)，技术选型见 [ARCHITECTURE.md](./ARCHITECTURE.md)，未完成项见 [TODO.md](./TODO.md)。

## 1. 触发方式

| 入口 | 行为 |
|---|---|
| 进入 / 切换 Tweet | 自动弹面板 + 自动生成（可在设置 →「自动生成」关闭；关闭后只弹面板，等手动点击） |
| 手动按钮 | 「生成回复」；已有结果时为「重新生成」；意图输入框内回车同样触发生成 |
| 页面形态 ① | Tweet 详情页（URL 主判：`/handle/status/<id>`） |
| 页面形态 ② | Timeline 点进 Modal（X 会 pushState 更新 URL，走同一路径） |
| 页面形态 ③ | `/home` 点回复图标弹出的 Reply Modal（**URL 不变**，走 dialog 兜底检测） |
| 离开 | 关 Modal / 回 Timeline → 取消在途生成并收起面板；瞬态 DOM 抖动由 400ms 确认期保护，不误判 |

## 2. 输入侧

- **TweetContext 提取**：正文、作者、@handle、URL、id、时间戳、点赞 / 转推 / 回复数、引用推文（嵌套一层）
- **意图输入框**（可选，上限 300 字）：写一句「我想说什么」，所有候选围绕该观点用不同风格表达；回车生成；切换 Tweet 自动清空
- **语言策略**：跟随原 Tweet 语言（若用户意图本身是另一种语言，按意图语言）

## 3. 风格系统（设置页 →「回复风格」）

- 内置 5 种：观点 / 补充 / 反向 / 简短 / 水贴，每种带一句风格说明写进 prompt
- 每种可 **启用 / 禁用**、设 **1–3 条**、用 **上下箭头调整顺序**（顺序即生成顺序与展示顺序）
- 候选总数上限 10；全部关闭时返回明确提示「没有启用任何回复风格」
- 「保存」按钮 + 改动即存双通道；「恢复默认」；页面内「最近操作」轨迹（最近 3 条）
- 配置归一化**保留用户排序**，新增内置风格自动追加到末尾，不打断已有顺序

## 4. 生成与模型

- DeepSeek（OpenAI 兼容协议），默认 `deepseek-flash`；Base URL 与模型可在设置页修改
- 请求只从 **background service worker** 发出（解决 CORS + 保护 API Key）；Key 仅存 `chrome.storage.local`
- 强制 JSON 输出（`response_format: json_object`）+ 30s 超时（AbortController）
- Prompt 约束：自然、不复述原推、避免 AI 腔、单条 ≤140 字、**风格顺序与数量精确**、同风格多条角度不同、不得编造事实、结构化 JSON 返回
- 返回映射兜底：模型返回的风格名不合法时，按用户配置顺序对齐，不会串位；总数截断 10
- 错误统一翻译为用户可读文案：未配 Key / Key 失效 / 网络不通 / 限流（429）/ 响应不可解析 / 无启用风格

## 5. 结果展示

- **一个风格一张卡**（1px 黑边框 + 黑底白字风格标识）；同风格多条候选为卡内条目
- 每条候选独立「填入 / ✓ 已填入」；**只标记最新填入的一条**，前一条状态自动恢复
- 生成中按钮转圈 + toast 状态提示（检测到新 Tweet / 已生成 / 已填入 / 错误）

## 6. 填入（只填入，不发送）

- 自动定位回复输入框：`contenteditable` + `role="textbox"` + 多语言 aria-label 关键词
- **替换语义**：先 `selectAll` + `delete` 清空，再写入，不会叠加
- 插入方式：**合成 paste 事件**（X 的 Lexical 编辑器自行接管，单次插入、状态同步、无幽灵节点）；失败降级 `execCommand('insertText')`
- 严格校验：输入框全文必须与目标文本完全一致，否则提示手动复制
- 找不到输入框 → 提示先点击「回复」
- **红线**：全流程不存在任何点击 Send / Post / 回复按钮的代码路径

## 7. 缓存与性能

- 会话内缓存键 `tweetId::intent`，带意图与不带意图结果并存；命中直接展示，不发请求
- 生成序号 guard：生成中切换 Tweet，过期结果直接丢弃，不错挂到新 Tweet
- 风格配置变更 → 清空缓存（避免展示旧配置的残留结果）
- DOM 监听 300ms debounce；监听 `pushState / replaceState / popstate` 处理 SPA 路由
- 所有 X DOM selector 集中在 `lib/content/x/selectors.ts`，改版只改一处

## 8. 可观测与排查手段

- Console 日志前缀 `[X Copilot]`：Tweet 切换、Modal 检测、清空等
- 设置页「最近操作」行：不用开 DevTools 即可确认点击是否被接收

## 9. 关键实现文件

| 文件 | 职责 |
|---|---|
| `components/App.tsx` | 状态机：触发、缓存、分组展示、填入 |
| `components/ReplyCard.tsx` | 风格卡片（卡内多条候选） |
| `lib/llm/openai-compat.ts` | Prompt 组装、请求、JSON 解析与映射 |
| `lib/llm/provider.ts` | LLMProvider 抽象（换模型不改上层） |
| `lib/content/x/tweet-detector.ts` | URL 主判 + Modal 兜底 + 变更监听 |
| `lib/content/x/composer-detector.ts` | 回复输入框定位 |
| `lib/content/x/fill.ts` | 替换语义写入（paste 优先，insertText 降级） |
| `lib/config.ts` | 默认配置、风格归一化（与静态 options 页保持同步） |
| `entrypoints/background.ts` | 请求代理 + 配置读取 |
| `public/options.html` / `options.js` | 设置页（静态，无构建） |

## 10. 尚未实现

- **流式输出**：首条候选秒级出现（需改长连接通信层）
- **候选级微调**：单条「更短 / 更口语 / 更犀利」
- **用量与成本护栏**：每日调用上限 + 已用次数显示
- **自定义风格**：用户自行新增风格（如提问式、数据党）
- **编辑 diff 回收 / 👍👎 反馈**：为个人风格学习与质量筛选铺路
- **语言策略开关**、**模型分级**（长文自动升 `deepseek-v4-pro`）
