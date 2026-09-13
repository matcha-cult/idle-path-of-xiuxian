/**
 * web 组件测试环境兜底（仅在 jsdom 环境生效）。
 *
 * Store / 真后端 e2e 测试在各自文件头用 `// @vitest-environment node` 回到 Node 环境，
 * 此时本文件必须**完全跳过** DOM 相关设置（否则 `window is not defined`）。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
// 与 ui-kit 共用同一份「可控视口」mock（单一实现，避免两包各写一套）
import { installViewportMock, resetViewport } from '@idle-path/ui-kit/testing';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasDom) {
  // antd 的响应式（Grid.useBreakpoint / Sider breakpoint / Drawer）全读 matchMedia；
  // jsdom 不实现它。默认视口 1280（桌面），测试可 setViewportWidth(393) 断言移动布局。
  installViewportMock(window);

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
