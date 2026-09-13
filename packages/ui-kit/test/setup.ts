/**
 * ui-kit 组件测试的统一环境兜底。
 *
 * jsdom 未实现 antd 依赖的若干浏览器 API（matchMedia / ResizeObserver），
 * 在此集中补齐，避免每个用例各自 mock。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// antd（响应式栅格、主题）会读 matchMedia；jsdom 不实现它。
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

// Table / 虚拟滚动等组件依赖 ResizeObserver。
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
