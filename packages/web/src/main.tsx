import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { RootStore } from './app/root-store.js';
import { RootStoreProvider } from './app/root-context.js';
import { ThemeRoot } from './theme/theme-root.js';
import './styles.css';

const rootStore = new RootStore();
// 主题态先于首次渲染恢复（index.html 的内联脚本已在首帧前写好 data-theme，避免闪烁）
rootStore.theme.hydrate();
void rootStore.bootstrap();

const container = document.getElementById('root');
if (container === null) throw new Error('缺少 #root 容器');

createRoot(container).render(
  <React.StrictMode>
    <RootStoreProvider value={rootStore}>
      <ThemeRoot>
        <App />
      </ThemeRoot>
    </RootStoreProvider>
  </React.StrictMode>,
);
