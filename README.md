<img src="assets/logo.png" alt="X Copilot" width="120">

# X Copilot

> X（Twitter）的浏览器扩展 AI Copilot。**Copilot, not bot** —— 只建议、只填入，绝不自动发送。

在 X 上浏览时，它会识别你正在看的帖子，用你配置的模型生成多条不同风格的**回复**候选（观点 / 补充 / 反向 / 简短 / 水贴），点一下就写进回复框，剩下的检查与发送由你本人完成。它同样能帮你**发帖**：从「随便聊聊 / Feed热帖 / 热点」里挑一个出发点，产出多条不同风格的帖子草稿。

所有生成动作都需要你主动触发或确认，插件在任何情况下都不会点击 Reply / Send / Post。

技术方案见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，产品需求见 [`PROJECT.md`](PROJECT.md)，各模块设计见 [`docs/`](docs/)（回复 [`REPLY_MODULE.md`](docs/REPLY_MODULE.md) · 发帖 [`POST_MODULE.md`](docs/POST_MODULE.md) · 内容清理 [`CLEAN_MODULE.md`](docs/CLEAN_MODULE.md)）。

## Installing / Getting started

环境要求：

- Node.js ≥ 18（建议 20+）
- Chrome / Edge（Manifest V3）
- 一个模型服务商的 API Key（DeepSeek 或 Google Gemini 均可，Gemini 有免费额度）

```shell
cd extension
npm install
npm run build      # 产物在 extension/.output/chrome-mv3/
```

然后加载扩展：

1. 打开 `chrome://extensions/`
2. 右上角开启 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择 `extension/.output/chrome-mv3/`
4. 打开 x.com，页面右侧会出现 ✦ 悬浮球

### Initial Configuration

插件需要一把模型 API Key 才能工作，配置入口在面板里：

1. 点 ✦ 悬浮球 → 面板左下角 **设置**
2. 在「模型配置」里选 **服务商**（DeepSeek 官方 / Google Gemini / 自定义）
3. 填入对应的 **API Key** 并保存 —— DeepSeek 在 [开放平台](https://platform.deepseek.com/) 获取（`sk-...`），Gemini 在 [AI Studio](https://aistudio.google.com/apikey) 获取（`AIza...`）
4. 选服务商会自动填好 Base URL 与模型；各家的 Key 会分别记住，来回切换自动回填

API Key 只写入本机 `chrome.storage.local`，请求只从 background service worker 发出。

## Developing

```shell
git clone https://github.com/Loveca/x-copilot.git
cd x-copilot/extension
npm install
npm run dev        # WXT 开发模式，改代码自动重载
```

仓库结构：

```
x-copilot/
├── extension/                 # 扩展本体
│   ├── entrypoints/           # background service worker、content script 入口
│   ├── components/            # 注入到 Shadow DOM 的 React UI（悬浮球 / 面板 / 候选卡）
│   ├── lib/
│   │   ├── llm/               # 服务商适配、流式解析、prompt 模板渲染
│   │   └── content/x/         # X 页面侧：帖子识别、写入输入框、内容清理
│   ├── prompts/               # 提示词模板（Markdown，构建期内联）
│   ├── public/                # Options 设置页（静态 HTML + JS，不走构建）
│   └── types/                 # 全局类型与 `?raw` 模块声明
├── docs/                      # 架构与各模块设计文档
└── PROJECT.md                 # 产品需求
```

几条开发时要留意的约定：

- **LLM 请求只从 background 发**，content script 只负责取页面数据与写回输入框
- **提示词是 Markdown 模板**，放在 `extension/prompts/`，用 Vite 的 `?raw` 在构建期内联（见下方 *Prompt 模板*）
- 新增服务商除了改 `lib/llm/`，还要把域名加进 `wxt.config.ts` 的 `host_permissions`，否则请求会被 CORS 拦
- 仓库路径包含中文时，Vite 的 multipage HTML 产出可能异常；本项目已把 Options 页放在 `public/` 下用原生 HTML/JS 实现，绕开该问题

### Building

```shell
npm run build      # 生产构建 → extension/.output/chrome-mv3/
npm run compile    # 只做类型检查（tsc --noEmit）
```

改了 `.ts` / `.tsx` / `prompts/*.md` 之后需要重新构建；在 `chrome://extensions` 里点一次**重新加载**，并**刷新 x.com 标签页**，新的 content script 才会生效。

### Deploying / Publishing

```shell
npm run zip        # 打包成可上传商店的 zip
```

也可以直接把 `extension/.output/chrome-mv3/` 目录分发给使用者，让他们用「加载已解压的扩展程序」安装。

### Prompt 模板

生成用的提示词不是硬编码在代码里的字符串，而是 `extension/prompts/` 下的 Markdown 模板：

| 文件 | 用途 |
|---|---|
| `gen_reply.md` | 回复生成 |
| `gen_quick_topic.md` | 灵感区「随便聊聊」的话题生成 |
| `post/head.md` `post/source-quick.md` `post/source-hot.md` `post/source-trend.md` `post/tail.md` | 发帖（按来源只拼装对应片段） |

模板支持两种语法，由 `lib/llm/templates.ts` 渲染：

- `{{变量}}` —— 变量替换（取不到则为空串）
- `{{#if 变量}}…{{/if}}` —— 变量非空时保留整段（不支持嵌套）

导入方式为 `import tpl from '@/prompts/gen_reply.md?raw'`，构建期由 Vite 内联成字符串常量，**运行时零 IO**。改提示词 = 改 `.md` 文件后重新构建。

## Features

**回复生成**

- 识别当前帖子（详情页 / 时间线 / 回复弹窗），一次生成多条候选，默认 5 条：观点 / 补充 / 反向 / 简短 / 水贴
- 风格、顺序、每风格条数都能在设置里改（总数上限 10），生成时严格按配置输出
- **意图输入框**：写一句话（如「他这套逻辑忽略了汇率」），所有候选都围绕这个观点展开；留空则由模型自行判断角度
- **流式逐条到达**：第一条生成完就渲染出来，可以先读先填，不必等全部完成
- 候选点击「填入」写进 X 的回复框，替换语义（不留残字），**不自动发送**

**发帖**

- 面板可切到「发帖」模式（帖子详情页 / 回复弹窗下不可用）
- **灵感来源**三个入口：
  - **随便聊聊** —— 自动产出 3 条话题（顶级认知 / 冷知识 / 扎心真相），点一条填进面板输入框当引子
  - **Feed热帖** —— 扫描当前页面互动最高的几条帖子，点一条取其内容作引子
  - **热点** —— 读取 X 右侧栏「正在流行」的话题，点一条作引子
- 发帖风格 5 种（观点 / 反直觉 / 提问互动 / 自嘲 / 废话体），与回复风格**完全独立**，各自配置
- 草稿可以是多行排版（短句 + 空行），点「填入」写入 X 的原生发帖框，**不自动发送**

**模型与体验**

- 服务商可切换：DeepSeek 官方 / Google Gemini / 自定义（OpenAI 兼容协议）
- **图片理解**：帖子里带照片时，最多取 4 张随文字一起发给模型；遇到不支持图片的模型会自动降级为纯文本重试
- **缓存**：同一条帖子 + 同样的意图，自动弹出面板时直接复用上次结果，不重复请求；手动点「生成 / 重新生成」一律真发请求
- 悬浮球可拖动，位置自动记忆；面板打开时自动收起
- 结果只存在内存中，关闭页面即失效

**内容清理（暂停中）**

评论区的垃圾 / 机器人回复折叠成一条可展开的占位条，**只做本地隐藏，不封禁、不举报、不静音、不取关**，判定完全离线完成。该模块目前整体暂停：自动扫描、设置入口与面板按钮都已关闭（代码保留），待完善后恢复。

## Configuration

设置页入口：面板左下角 **设置**（打开 `chrome://extensions` 里本扩展的「扩展程序选项」也可以）。左侧导航切换五个分区：

### 模型配置

#### 服务商

Type: `deepseek | gemini | custom`  
Default: `deepseek`

选择服务商会自动填入对应的 Base URL 与模型，之后仍可手动改。切换服务商时，之前填过的 Key 会自动回填。

#### API Key

Type: `String`  
Default: 空

只保存在本机 `chrome.storage.local`。DeepSeek 为 `sk-...`，Gemini 为 `AIza...`。

#### 模型

Type: `String`（下拉框，选「自定义…」可手动输入）  
Default: DeepSeek `deepseek-flash` · Gemini `gemini-flash-lite-latest`

下拉框只列该服务商实测可用的模型，避免选到没有额度的型号。

#### API Base URL

Type: `String`  
Default: DeepSeek `https://api.deepseek.com/v1` · Gemini `https://generativelanguage.googleapis.com/v1beta/openai`

自定义服务商需要自行把域名加进 `wxt.config.ts` 的 `host_permissions` 后重新构建。

#### 深度思考

Type: `Boolean`  
Default: `false`

开启后模型先推理再作答。写回复用不到推理，开了首条候选要多等十几秒，因此默认关闭。

### 回复风格

Type: 风格列表（顺序 / 启用 / 条数）  
Default: 观点 · 补充 · 反向 · 简短 · 水贴，各 1 条

用上下箭头调整顺序、设定每种风格的条数（每种最多 3 条，总数上限 10）。生成时严格按此顺序与数量输出；取消勾选某条风格即不再生成它。

### 发帖风格

Type: 风格列表（顺序 / 启用 / 条数）  
Default: 观点 · 反直觉 · 提问互动 · 自嘲 · 废话体，各 1 条

与「回复风格」完全独立的第二套配置，互不影响。

### 自动生成

#### 自动生成回复

Type: `Boolean`  
Default: `true`

打开或切换帖子时自动生成候选并弹出面板。关闭后只弹出面板，等你手动点「生成回复」。

### 插件信息

- 版本号与开源仓库地址
- 数据处理说明
- **开发者选项 → 显示生成耗时信息**（Type: `Boolean`，Default: `false`）：在面板底部显示首字节 / 出字 / 首条 / 完成耗时、实际使用的模型名与字数统计，排查速度问题时打开

## Contributing

欢迎 fork 与 PR。提交前请确保 `npm run compile` 与 `npm run build` 都通过。

改动提示词不需要碰代码——直接改 `extension/prompts/` 下的 Markdown 模板即可；涉及新建模块时，请先在 `docs/` 下补一份设计说明。

## Links

- 仓库：https://github.com/Loveca/x-copilot
- 问题反馈：https://github.com/Loveca/x-copilot/issues
  - 涉及隐私或安全的问题，请优先通过仓库主页的联系方式直接联系，而不是开公开 issue
- 相关文档：
  - 产品需求：[`PROJECT.md`](PROJECT.md)
  - 技术方案：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  - 模块设计：[`docs/REPLY_MODULE.md`](docs/REPLY_MODULE.md) · [`docs/POST_MODULE.md`](docs/POST_MODULE.md) · [`docs/CLEAN_MODULE.md`](docs/CLEAN_MODULE.md)
  - 待办与已知问题：[`docs/TODO.md`](docs/TODO.md)

## 隐私与安全

- 不读取、不保存 X 的登录 Cookie 或密码
- **不自动发送 / 点赞 / 关注**，不做任何批量账号操作；所有填入动作都只写内容，发送按钮永远由你点击
- 不收集任何统计数据；内容清理只做本地隐藏
- API Key 仅存本机，请求只从 background service worker 发出
- **会上传什么**：被识别的帖子文本（以及帖子里带的图片，最多 4 张）会发送到你在「模型配置」里选定的服务商用于生成结果，不经过其他任何服务器，也不会被插件持久化存储

## Licensing

本项目采用 **MIT 许可证**，全文见 [`LICENSE`](LICENSE)。

你可以自由使用、修改、分发、商用（包括闭源分发），唯一要求是保留版权声明与许可声明。软件按「原样」提供，不附带任何担保。
