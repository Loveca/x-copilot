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
