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
- 采用 X 暗色主题色板：背景 #000、卡片/悬停 #16181c、描边 #2f3336、主文字 #e7e9ea、次级 #71767b、提示 #536471、错误 #f4212e
- 主操作按钮 = 白底黑字（对齐 X 的 Post 按钮）；悬浮球为黑底白字 + #2f3336 描边
- 样式集中在 `extension/components/styles.ts`（Shadow DOM 内联 CSS）；Options 页样式在 `extension/public/options.html`，两处需同步改

## 仓库约定
- Git 身份：Loveca <Loveca@users.noreply.github.com>（GitHub 用户名 Loveca），已写入本仓库 local config；历史提交已批量重写为该身份。
- 远端：origin = **git@github.com:Loveca/x-copilot.git（SSH）**，master 已跟踪。
- 推送方式：本机 SSH 已配好（`~/.ssh/id_ed25519_github` + config 中的 github.com Host 段），`ssh -T git@github.com` 认证为 Loveca；**SSH 22 端口直连可用，无需代理，无需 GCM/HTTPS**。HTTPS 直连 github.com 反而被重置，别走那条路。
- 本项目历史曾因环境丢文件而丢失，为避免再次发生，重要变更后应及时 `git push`。
