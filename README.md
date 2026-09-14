# X Copilot

> X (Twitter) 的 Chrome Extension AI Copilot。**Copilot, not bot** —— 只建议、只填入，绝不自动发送。

在浏览 X 时，点开悬浮球 ✦，Copilot 自动识别当前 Tweet，生成 5 条不同风格的评论候选（观点 / 补充 / 反向 / 简短 / 水贴），点击「填入」写入 Reply 输入框，由你自己检查后发送。

技术方案见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，产品需求见 [`docs/PROJECT.md`](docs/PROJECT.md)。

## 技术架构

```
X 页面 (content script, Shadow DOM UI)
    ├── TweetDetector：URL 主判 + DOM 字段提取
    ├── FloatingButton + Panel（React，渲染进 Shadow DOM）
    └── Fill Reply（execCommand insertText，只填入不发送）
        ↓ chrome.runtime.sendMessage
Background service worker（无状态，LLM 请求代理）
    ↓ fetch
DeepSeek API（OpenAI 兼容协议，默认 deepseek-flash）
```

- 构建工具链：WXT + Vite + React 18 + TypeScript
- LLM：DeepSeek（`https://api.deepseek.com/v1`），API Key 只存本机 `chrome.storage.local`
- 权限最小化：仅 `storage` + `x.com` / `api.deepseek.com` 两个 host

## 环境要求

- Node.js ≥ 18（建议 20+）
- Chrome / Edge 浏览器（Manifest V3）
- DeepSeek API Key

## 安装依赖

```bash
cd extension
npm install
```

## 配置 API

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key
2. 构建完成后，加载插件 → 打开任意 X 页面 → 点击 ✦ 悬浮球 → Panel **左下角「设置」** → 填入 API Key → 保存
3. （可选）修改模型或 Base URL，默认 `deepseek-flash` / `https://api.deepseek.com/v1`

设置页分为三个分区（左侧导航切换）：

| 分区 | 内容 |
|---|---|
| 模型配置 | API Key、模型、API Base URL |
| 回复风格 | 拖拽排序、每种风格的候选数量与启用开关（生成时严格按此顺序与数量输出） |
| 自动生成 | 自动生成评论建议开关（关闭后需手动点击生成） |
| 插件信息 | 版本、仓库地址、数据处理说明 |

## 构建 Extension

```bash
npm run build     # 产物在 .output/chrome-mv3/
npm run dev       # 开发模式（HMR）
```

> ⚠️ 如果项目路径包含中文/非 ASCII 字符：本项目的 Options 页已改为 `public/options.html` 静态实现，构建不受影响。若后续新增 HTML 入口（如新页面），在中文路径下 Vite 可能不产出 HTML，届时请通过 ASCII 路径的 junction 目录构建。

## Chrome 加载方式

1. 打开 `chrome://extensions/`
2. 右上角开启 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `extension/.output/chrome-mv3/` 目录

## 使用流程

```
打开 X → 进入任意 Tweet 详情页 → 点击右侧 ✦ 悬浮球
→ Panel 打开 → 点击「生成评论建议」
→ 得到 5 条不同风格候选 → 点击「填入」
→ 文字进入 Reply 输入框 → 你自行检查修改 → 你自己点击发送
```

悬浮球可拖动，位置自动记忆。

## 常见问题

**Q：点击生成提示「尚未配置 API Key」？**
点击 Panel 左下角「设置」→ 填入 DeepSeek API Key 并保存。

**Q：提示「未找到评论输入框」？**
先点击 Tweet 下方的 Reply 按钮展开输入框，再点「填入」。

**Q：生成失败 / 无法连接？**
检查网络与 API Key；DeepSeek 服务偶尔限流（429），稍后重试。

**Q：插件会自动发评论吗？**
不会。任何情况下插件都不点击 Reply / Send / Post，发送动作只能由你本人完成。

**Q：我的 Tweet 数据会被上传吗？**
当前识别的 Tweet 文本会发送给你配置的 LLM endpoint（默认 DeepSeek）用于生成评论，不经过任何其他服务器，也不会被插件存储。

## 隐私与安全

- 不读取、不保存 X 登录 Cookie 或密码
- 不自动发送 / 点赞 / 关注，不做任何批量账号操作
- API Key 仅存本机，仅从 background service worker 发起请求
