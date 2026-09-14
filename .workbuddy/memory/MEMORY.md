# X Copilot 项目长期备忘

## 技术栈定案（详见 docs/ARCHITECTURE.md）
- WXT 0.19.x + React 18 + TS；悬浮球 + 注入式 Shadow DOM Panel（不用 chrome.sidePanel）
- LLM：DeepSeek，OpenAI 兼容协议，默认模型 deepseek-flash（deepseek-v4-pro 为备选）；请求只从 background SW 发
- 红线：绝不自动发送/点赞/关注；API key 只存 chrome.storage.local

## 环境坑（长期有效）
- 本项目路径含中文「开发项目」→ Vite HTML 入口（multipage build）不产出 HTML 文件。对策：HTML 页面一律放 public/ 用静态原生 JS，entrypoints 只放 JS/TS 入口。若必须新增构建型 HTML，用 ASCII 路径 junction 目录构建。
- WXT 0.19.29：defineBackground/defineContentScript 从 'wxt/sandbox' 导入；entrypoints/ 顶层裸 .ts/.tsx 会被当 unlisted 入口在构建期执行，非入口代码放 components/ 或 lib/。
- 本机 npm/node：node 22.22.2 + npm 10.9.7 在 PATH 可直接用。

## 用户偏好（本项目）
- 先方案/选项确认再动手；对输出质量要求高（视觉精美、可直接用）。
- 沟通直接，反馈激烈时快速迭代而非辩解。

## UI 主题（已定）
- 采用 **X 浅色主题**色板（用户使用 X 白底黑字）：背景 #fff、卡片/悬停 #f7f9f9、分隔线 #eff3f4、强边框 #cfd9de、主文字 #0f1419、次级 #536471、提示 #8b98a5、错误 #f4212e
- 主操作按钮 = 黑底白字（对齐 X 浅色模式的 Post 按钮）；悬浮球为白底黑字 + #cfd9de 描边，**Panel 打开时悬浮球淡出隐藏**
- 不再在 UI 上放「只填入/不自动发送」这类免责提示（用户明确要求去掉），红线只保留在文档与 README
- 样式集中在 `extension/components/styles.ts`（Shadow DOM 内联 CSS）；Options 页样式在 `extension/public/options.html`，两处需同步改

## 设置页架构（扩展预留）
- Options 页为**左侧导航 + 右侧内容**分区结构（`public/options.html` + `public/options.js`，静态实现，无构建）
- 现有分区（命名要直白，用户明确要求）：**模型配置** / **回复风格** / **自动生成** / **插件信息**
- 回复风格可配置：`uiConfig.styles: StyleConfig[]`（key/label/desc/enabled/count，顺序即候选顺序），设置页支持拖拽排序、每种 1-3 条、启用开关、恢复默认；生成时 prompt 按顺序+数量输出，count 上限 3、总数上限 10；风格变更会清空 Panel 会话缓存
- 拖拽排序用 **pointer 事件**（handle 上 pointerdown + document move/up + 实时换位），不要用 HTML5 原生 DnD——含表单控件的行里不可靠（实测不触发）
- Panel 展示：**一个风格一张卡，同风格多条候选为卡内 item**（App 里 groupByStyle 分组），每条候选自带「填入」按钮
- 静态 options 页与 `lib/config.ts` 有重复常量（DEFAULT_STYLES），新增/改风格时两处都要改（options.js 顶部有注释提示）
- 存储分键：`llmConfig`（API Key/模型/BaseURL）、`uiConfig`（交互类，当前仅 autoGenerate）
- 新增设置项的流程：types 里加字段 → lib/config.ts 补默认值 → options 页加 UI → content script 用 `storage.onChanged` 订阅即时生效
- 后续规划：主题色切换、登录、统计面板

## 仓库约定
- Git 身份：Loveca <Loveca@users.noreply.github.com>（GitHub 用户名 Loveca），已写入本仓库 local config；历史提交已批量重写为该身份。
- 远端：origin = **git@github.com:Loveca/x-copilot.git（SSH）**，master 已跟踪。
- 推送方式：本机 SSH 已配好（`~/.ssh/id_ed25519_github` + config 中的 github.com Host 段），`ssh -T git@github.com` 认证为 Loveca；**SSH 22 端口直连可用，无需代理，无需 GCM/HTTPS**。HTTPS 直连 github.com 反而被重置，别走那条路。
- 本项目历史曾因环境丢文件而丢失，为避免再次发生，重要变更后应及时 `git push`。
