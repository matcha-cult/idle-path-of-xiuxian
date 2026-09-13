import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { RootStore } from './app/root-store.js';
import { RootStoreProvider } from './app/root-context.js';
import './styles.css';

const rootStore = new RootStore();
void rootStore.bootstrap();

const container = document.getElementById('root');
if (container === null) throw new Error('缺少 #root 容器');

createRoot(container).render(
  <React.StrictMode>
    <RootStoreProvider value={rootStore}>
      <App />
    </RootStoreProvider>
  </React.StrictMode>,
);
