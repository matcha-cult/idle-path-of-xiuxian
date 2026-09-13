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
import { afterEach } from 'vitest';
import { installViewportMock, resetViewport } from '../src/testing/viewport.js';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasDom) {
  // antd 的响应式（Grid.useBreakpoint / Sider breakpoint / Drawer）全读 matchMedia；
  // jsdom 不实现它。用**可控视口** mock：默认 1280（桌面），测试可切到手机宽度断言移动布局。
  installViewportMock(window);

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
    resetViewport();
  });
}
