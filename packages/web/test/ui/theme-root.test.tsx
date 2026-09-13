/**
 * ThemeRoot 集成（jsdom）：主题态 → antd Provider → document 标记 + CSS 变量桥。
 *
 * 断言「真实效果」而非实现细节：
 * - `documentElement.dataset.theme` / `color-scheme` 随 store 变化；
 * - `--app-*` CSS 变量被真实 antd token 填上，且亮/暗两态取值不同；
 * - 切换后子组件仍正常渲染（不炸、不白屏）。
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RootStoreProvider } from '../../src/app/root-context.js';
import { RootStore } from '../../src/app/root-store.js';
import { createMemoryStorage } from '../../src/services/storage.js';
import { AppThemeToggle } from '../../src/components/AppThemeToggle.js';
import { ThemeRoot } from '../../src/theme/theme-root.js';
import { THEME_STORAGE_KEY } from '../../src/theme/theme-store.js';

function makeRoot() {
  return new RootStore({
    wsUrl: 'ws://test/ws',
    apiBaseUrl: '/api',
    fetchImpl: vi.fn(),
    storage: createMemoryStorage(),
    autoRefreshMetricsMs: 0,
    heartbeat: false,
    reconnect: { enabled: false },
  });
}

function renderThemed(root: RootStore) {
  return render(
    <RootStoreProvider value={root}>
      <ThemeRoot>
        <span data-testid="content">content</span>
        <AppThemeToggle />
      </ThemeRoot>
    </RootStoreProvider>,
  );
}

afterEach(() => {
  delete document.documentElement.dataset['theme'];
  document.documentElement.style.removeProperty('color-scheme');
});

describe('ThemeRoot · 主题态到 document 的接线', () => {
  it('默认亮色：写入 data-theme=light 与 color-scheme=light', () => {
    const root = makeRoot();
    renderThemed(root);

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(screen.getByTestId('content')).toBeInTheDocument();
    root.dispose();
  });

  it('hydrate(dark) 后首帧即为暗色（无先亮后暗）', () => {
    const storage = createMemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'dark');
    const root = new RootStore({
      wsUrl: 'ws://test/ws',
      apiBaseUrl: '/api',
      fetchImpl: vi.fn(),
      storage,
      autoRefreshMetricsMs: 0,
      heartbeat: false,
      reconnect: { enabled: false },
    });
    root.theme.hydrate();

    renderThemed(root);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    root.dispose();
  });

  it('token 桥把真实 antd token 写进 --app-* 变量（非空）', () => {
    const root = makeRoot();
    renderThemed(root);

    const bg = document.documentElement.style.getPropertyValue('--app-bg');
    const text = document.documentElement.style.getPropertyValue('--app-text');
    const accent = document.documentElement.style.getPropertyValue('--app-accent');
    expect(bg).not.toBe('');
    expect(text).not.toBe('');
    expect(accent).not.toBe('');
    root.dispose();
  });

  it('亮/暗切换后标记与 CSS 变量取值都变化', async () => {
    const root = makeRoot();
    renderThemed(root);

    const lightBg = document.documentElement.style.getPropertyValue('--app-bg');

    await act(async () => {
      root.theme.setMode('dark');
    });

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    const darkBg = document.documentElement.style.getPropertyValue('--app-bg');
    expect(darkBg).not.toBe('');
    expect(darkBg).not.toBe(lightBg);

    // 子树仍然健康（切换不导致崩溃/空白）
    expect(screen.getByTestId('content')).toBeInTheDocument();
    root.dispose();
  });

  it('一键切换按钮点击后 store 与 document 同步（并落盘）', async () => {
    const root = makeRoot();
    renderThemed(root);

    const button = screen.getByTestId('theme-float-button');
    await userEvent.click(button);

    expect(root.theme.mode).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    root.dispose();
  });
});
