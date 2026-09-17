<p align="center">
  <img src="assets/logo.png" alt="X Copilot" width="120">
</p>

<h1 align="center">X Copilot</h1>

<p align="center">
  <b>X（Twitter）的浏览器扩展 AI Copilot</b><br>
  回复生成 · 帖子生成 · 多模型自选 · 开源免费 · 只填入不发送
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square">
  <img alt="WXT" src="https://img.shields.io/badge/Built%20with-WXT-0EA5E9?style=flat-square">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white&style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white&style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-3DA639?style=flat-square">
</p>

---

![X Copilot：一键生成多条不同风格的回复候选](assets/reply-candidates.png)

## 项目简介

X Copilot 是一个 X（Twitter）浏览辅助扩展：识别你正在看的帖子，用你自己配置的模型生成多条不同风格的**回复**或**帖子**，点一下写进输入框 —— 检查与发送始终由你完成。

### 本项目做什么

- **回复生成** — 识别当前帖子，一次给出多条不同风格的回复候选，点「填入」写进 X 的回复框
- **帖子生成** — 从「随便聊聊 / Feed热帖 / 热点」挑一个出发点，产出多条不同风格的帖子
- **模型自选** — DeepSeek / Google Gemini / 任意 OpenAI 兼容服务；API Key 你自备、只存本机，没有中间服务器，也没有订阅费

### 本项目不做什么

- **不自动发送** — 任何情况下都不点 Reply / Send / Post；填入之后改不改、发不发都由你决定
- **不碰你的账号** — 不读取登录 Cookie，不做点赞 / 关注 / 取关等任何写操作
- **不多传数据** — 只把当前这条帖子的文本（和最多 4 张配图）发给**你自己配置的**模型服务

## 核心能力

### 回复

- **多风格候选** — 默认 5 条：观点 · 补充 · 反向 · 简短 · 水贴；顺序与条数可在设置里改
- **意图输入** — 写一句话（如「他这套逻辑忽略了汇率」），所有候选围绕这个观点展开；留空则由模型自行判断角度
- **流式逐条到达** — 第一条生成完就渲染，可以先读先填，不必等全部完成
- **图片理解** — 帖子带照片时最多取 4 张随文字一起发送；模型不支持图片时自动降级为纯文本重试
- **结果缓存** — 同一条帖子 + 同样的意图，自动弹面板时直接复用；手动点「生成」一律真发请求

![点「填入」写进 X 回复框，发送与否始终由你决定](assets/reply-filled.png)

### 发帖

- **三个灵感入口** — 随便聊聊（自动产出 3 条话题）· Feed热帖（扫当前页面互动最高的帖子）· 热点（读 X 右侧栏趋势），点一条填进输入框当引子
- **独立风格库** — 观点 · 反直觉 · 提问互动 · 自嘲 · 废话体，与回复风格完全独立、各自配置
- **多行排版** — 支持「短句 + 空行」的中文区排版

![发帖灵感：随便聊聊 / Feed热帖 / 热点](assets/post-inspiration.png)

![生成的帖子一键填入 X 发帖框](assets/post-filled.png)

### 模型与体验

- **服务商可切换** — DeepSeek 官方 / Google Gemini（有免费额度）/ 自定义 OpenAI 兼容服务
- **悬浮按钮** — 可拖动、位置自动记忆；尺寸与样式对齐 X 自己的浮动按钮

## 快速开始

需要 Chrome 或 Edge（Manifest V3）。

### 方式一：下载即用（推荐）

1. 到 [Releases](https://github.com/Loveca/x-copilot/releases) 下载最新的 `x-copilot-<版本号>-chrome.zip`（形如 `x-copilot-0.1.0-chrome.zip`），解压到本地任意文件夹
2. 打开 `chrome://extensions/` → 开启右上角**开发者模式** → **加载已解压的扩展程序** → 选择刚解压出的文件夹
3. 打开 x.com，页面右侧出现 ✦ 悬浮按钮即安装成功

> 本扩展未经应用商店签名，因此需以「已解压」方式加载；Chrome 对开发者模式扩展的提示属正常现象。

### 方式二：从源码构建（开发者）

需要 Node.js ≥ 18：

```bash
git clone https://github.com/Loveca/x-copilot.git
cd x-copilot/extension
npm install
npm run build          # 产物在 .output/chrome-mv3/
```

然后按方式一的第 2 步加载 `extension/.output/chrome-mv3/`。

### 首次配置

1. 点 ✦ 悬浮按钮 → 面板左下角**设置**
2. 在「模型配置」里选**服务商**，填入 **API Key** 并保存

Key 在 [DeepSeek 开放平台](https://platform.deepseek.com/)（`sk-...`）或 [Google AI Studio](https://aistudio.google.com/apikey)（`AIza...`）获取，只存本机 `chrome.storage.local`。

## 配置

设置页入口：面板左下角**设置**。五个分区：

| 分区 | 内容 |
|---|---|
| 模型配置 | 服务商 · API Key · 模型 · Base URL · 深度思考（默认关） |
| 回复风格 | 排序 / 启用 / 每条风格的条数（每种 ≤ 3，总数 ≤ 10） |
| 发帖风格 | 同上，与回复风格完全独立 |
| 自动生成 | 打开帖子时是否自动生成并弹面板（默认开） |
| 插件信息 | 版本 · 仓库地址 · 数据处理说明 · 开发者选项（显示生成耗时） |

默认值都在 [`extension/lib/config.ts`](extension/lib/config.ts)。

## 隐私与安全

- 不读取、不保存 X 登录 Cookie 或密码
- **不自动发送 / 点赞 / 关注**，不做任何批量账号操作
- API Key 只存本机，请求只从 background service worker 发出
- 发送给模型服务的只有当前帖子的文本与（最多 4 张）配图，不经过其他服务器，也不会被插件持久化保存
- 代码以 MIT 开源，可自行审计

## 开发者

想改代码或参与贡献，见 [CONTRIBUTING.md](docs/CONTRIBUTING.md)。

设计文档：[产品规格](docs/PROJECT.md) · [架构](docs/ARCHITECTURE.md) · [回复模块](docs/REPLY_MODULE.md) · [发帖模块](docs/POST_MODULE.md) · [清理模块](docs/CLEAN_MODULE.md)

## 许可

本项目采用 [MIT License](LICENSE)。你可以自由使用、修改、分发、商用（包括闭源），唯一要求是保留版权与许可声明。
