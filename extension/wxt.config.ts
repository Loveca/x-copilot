import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'X Copilot',
    description: 'AI comment suggestions for X. Copilot, not bot — never auto-sends.',
    version: '0.1.0',
    permissions: ['storage'],
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
