import { createShadowRootUi } from 'wxt/client';
import ReactDOM from 'react-dom/client';
import { defineContentScript } from 'wxt/sandbox';
import { App } from '@/components/App';
import { CSS_TEXT } from '@/components/styles';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'x-copilot-root',
      position: 'overlay',
      anchor: 'body',
      onMount: (container) => {
        const host = document.createElement('div');
        host.className = 'xc-host';
        const style = document.createElement('style');
        style.textContent = CSS_TEXT;
        container.appendChild(style);
        container.appendChild(host);
        const root = ReactDOM.createRoot(host);
        root.render(<App />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
