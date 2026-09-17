import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'X Copilot',
    description: 'X 上的 AI 助手：生成回复与帖子，只填入、绝不自动发送。',
    version: '0.1.0',
    permissions: ['storage'],
    // 自定义 OpenAI 兼容服务的 endpoint 在设置页保存时动态申请
    optional_host_permissions: ['*://*/*'],
    icons: {
      16: 'icon/16.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    // 请求只从 background SW 发出，host 权限用于绕过 CORS
    host_permissions: [
      'https://x.com/*',
      'https://api.deepseek.com/*',
      'https://generativelanguage.googleapis.com/*',
      // 帖子图片（带图生成时由 background 取回转 base64）
      'https://pbs.twimg.com/*',
    ],
    options_ui: {
      open_in_tab: true,
      page: 'options.html',
    },
  },
});
