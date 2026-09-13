/**
 * web 组件测试环境兜底（仅在 jsdom 环境生效）。
 *
 * Store / 真后端 e2e 测试在各自文件头用 `// @vitest-environment node` 回到 Node 环境，
 * 此时本文件必须**完全跳过** DOM 相关设置（否则 `window is not defined`）。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasDom) {
  // antd 会读 matchMedia（响应式/主题）；jsdom 不实现。
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      writable: true,
      configurable: true,
      value: ResizeObserverStub,
    });
  }

  afterEach(() => {
    cleanup();
  });
}
