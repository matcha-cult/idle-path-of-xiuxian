/**
 * ui-kit 组件测试的统一环境兜底（仅在 jsdom 环境生效）。
 *
 * jsdom 未实现 antd 依赖的若干浏览器 API（matchMedia / ResizeObserver），
 * 在此集中补齐，避免每个用例各自 mock。
 *
 * 纯 Node 测试（如 `test/hygiene.test.ts` 用 `// @vitest-environment node`）会加载本文件，
 * 因此这里必须**完全跳过** DOM 相关设置，否则报 `window is not defined`。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasDom) {
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

  // jsdom 的 getComputedStyle 不支持伪元素参数，会走「Not implemented」分支并经 virtualConsole
  // 逐次打印错误 —— rc-table 等组件高频调用，实测拖慢整个套件且污染输出。
  // 这里包一层：忽略伪元素参数，直接转发真实实现。
  const realGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((element: Element) =>
    realGetComputedStyle(element)) as typeof window.getComputedStyle;

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
}
