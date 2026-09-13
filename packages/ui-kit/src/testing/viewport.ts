/**
 * 测试用**可控视口**（jsdom 没有真实布局，antd 的响应式全靠 `matchMedia`）。
 *
 * 为什么需要：`Grid.useBreakpoint()` / `Sider breakpoint` / `Drawer` 全都读 `window.matchMedia`，
 * 而 jsdom 不实现它；若只返回 `matches:false`，所有响应式分支都会落到「手机」，
 * 组件测试就失去了意义（而且 PC/移动两套布局都要能断言）。
 *
 * 能力：
 * - 解析 `(min-width: Npx)` / `(max-width: Npx)` 查询；
 * - `installViewportMock(width)` 安装 mock（默认 **1280**，即桌面）；
 * - `setViewportWidth(px)` 改宽度并**通知已注册的监听器**，可测「断点切换」行为；
 * - `resetViewport()` 复位为默认宽度。
 *
 * 由 `@idle-path/ui-kit/testing` 导出，ui-kit 与 web 的测试 setup 共用同一实现。
 */
export const DEFAULT_VIEWPORT_WIDTH = 1280;

interface MediaQueryListLike {
  matches: boolean;
  media: string;
  onchange: ((event: { matches: boolean; media: string }) => void) | null;
  addListener(listener: (event: unknown) => void): void;
  removeListener(listener: (event: unknown) => void): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  dispatchEvent(): boolean;
}

let viewportWidth = DEFAULT_VIEWPORT_WIDTH;
const registered = new Set<MockMediaQueryList>();

function matchesQuery(query: string, width: number): boolean {
  const min = /\(min-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
  const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
  let result = true;
  if (min !== null) result = result && width >= Number(min[1]);
  if (max !== null) result = result && width <= Number(max[1]);
  return result;
}

class MockMediaQueryList implements MediaQueryListLike {
  onchange: ((event: { matches: boolean; media: string }) => void) | null = null;
  private readonly listeners = new Set<(event: unknown) => void>();

  constructor(readonly media: string) {
    this.matches = matchesQuery(media, viewportWidth);
    registered.add(this);
  }

  matches: boolean;

  addListener(listener: (event: unknown) => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: (event: unknown) => void): void {
    this.listeners.delete(listener);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (type === 'change') this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    if (type === 'change') this.listeners.delete(listener);
  }

  dispatchEvent(): boolean {
    return true;
  }

  /** 仅供 mock 内部：宽度变化时重算并通知。 */
  refresh(): void {
    const next = matchesQuery(this.media, viewportWidth);
    if (next === this.matches) return;
    this.matches = next;
    const event = { matches: next, media: this.media };
    this.onchange?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

/** 安装可控 matchMedia（幂等；重复调用只更新宽度）。 */
export function installViewportMock(host: unknown = globalThis, width = DEFAULT_VIEWPORT_WIDTH): void {
  viewportWidth = width;
  const target = host as { matchMedia?: unknown };
  Object.defineProperty(target, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryListLike => new MockMediaQueryList(query),
  });
}

/** 改变视口宽度并通知监听器（用于断言跨断点的布局切换）。 */
export function setViewportWidth(width: number): void {
  viewportWidth = width;
  for (const mql of registered) mql.refresh();
}

/** 复位为默认宽度。 */
export function resetViewport(): void {
  setViewportWidth(DEFAULT_VIEWPORT_WIDTH);
}

/** 当前视口宽度（诊断用）。 */
export function getViewportWidth(): number {
  return viewportWidth;
}
