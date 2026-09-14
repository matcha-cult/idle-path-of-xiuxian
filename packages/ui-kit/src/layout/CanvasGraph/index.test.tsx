/**
 * `CanvasGraph` 组件集成测试。
 *
 * 三块内容：
 * 1. **交互契约**：渲染枢纽、点击只选中、禁用不可交互、拖拽抑制、`touchAction`（捏合前提）；
 * 2. **三条手势端到端**：鼠标滚轮缩放、双指捏合缩放、拖拽平移（含惯性）；
 * 3. ⭐ **量化对照**：同一段 60 帧拖动，`CanvasGraph`（canvas 混合 + 命令式写位姿）与
 *    旧 `GraphCanvas`（SVG + 每帧 `setPan`）的 **React 提交次数**实测对比。
 *    这是「手感」里唯一能被机器确定性量化的部分，也是本轮换路线的主要动机之一。
 *
 * jsdom 没有真实布局 / 2D 上下文，这里统一打桩：容器 660×660、`getContext` 返回 null
 * （画布底图不画，枢纽照常定位 —— 正是设计的退化路径）。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Profiler as ReactProfiler } from 'react';
import type { ReactElement } from 'react';
import { GraphCanvas } from '../GraphCanvas/index.js';
import { CanvasGraph } from './index.js';

const VIEW = { w: 660, h: 660 };
const ROWS = 21;
const COLS = 21;

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: VIEW.w,
    bottom: VIEW.h,
    width: VIEW.w,
    height: VIEW.h,
    toJSON: () => ({}),
  } as DOMRect);
  // jsdom 的 getContext 未实现（会往 stderr 喷 "Not implemented"）→ 显式返回 null
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

/**
 * jsdom 的 `PointerEvent` 不带 `pointerId` / `clientX/Y`，因此手工造一个普通 `Event`
 * 并挂上这些属性；React 18 的 `onPointer*` 会照常触发（与既有 GraphCanvas 测试同一手法）。
 */
function pointer(
  node: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: Record<string, unknown> = {},
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, ...init });
  node.dispatchEvent(event);
}

const ITEMS = [
  { key: 'a', row: 0, col: 10, content: <span>A</span>, title: '北门' },
  { key: 'b', row: 20, col: 10, content: <span>B</span> },
  { key: 'c', row: 10, col: 10, content: <span>C</span>, disabled: true },
];

function pinTransform(key: string): string {
  return (screen.getByTestId(`canvas-graph-item-${key}`) as HTMLElement).style.transform;
}

describe('渲染与交互契约', () => {
  it('渲染全部枢纽；拿不到 2D 上下文也不崩（宁可少一层底图，也不要整块画布消失）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    expect(screen.getByTestId('canvas-graph')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-graph-surface')).toBeInTheDocument();
    for (const key of ['a', 'b', 'c']) {
      expect(screen.getByTestId(`canvas-graph-item-${key}`)).toBeInTheDocument();
    }
  });

  it('**点击只选中**：轻点枢纽 → onSelect(tap)', () => {
    const onSelect = vi.fn();
    render(
      <CanvasGraph rows={ROWS} cols={COLS} items={ITEMS.map((item) => ({ ...item, onSelect }))} />,
    );
    const pin = screen.getByTestId('canvas-graph-item-a');
    act(() => {
      pointer(pin, 'pointerdown', { clientX: 100, clientY: 100 });
      pointer(pin, 'pointerup', { clientX: 100, clientY: 100 });
    });
    expect(onSelect).toHaveBeenCalledWith('tap');
  });

  it('禁用的枢纽点了也不回调（GraphCanvas 同口径：disabled 直接跳过）', () => {
    const onSelect = vi.fn();
    render(
      <CanvasGraph rows={ROWS} cols={COLS} items={ITEMS.map((item) => ({ ...item, onSelect }))} />,
    );
    const pin = screen.getByTestId('canvas-graph-item-c');
    act(() => {
      pointer(pin, 'pointerdown', { clientX: 100, clientY: 100 });
      pointer(pin, 'pointerup', { clientX: 100, clientY: 100 });
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('拖动抑制 + 捏合前提两项样式都在容器上（删任一都会回归）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    expect(host.style.touchAction).toBe('none'); // 触屏不抢手势 → 捏合可用
    expect(host.style.userSelect).toBe('none'); // 鼠标拖动不拉出选区
    expect(host.style.cursor).toBe('grab');
  });

  it('空白轻点回调 onBackgroundClick（用于收起详情）', () => {
    const onBackgroundClick = vi.fn();
    render(
      <CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} onBackgroundClick={onBackgroundClick} />,
    );
    const host = screen.getByTestId('canvas-graph');
    act(() => {
      pointer(host, 'pointerdown', { clientX: 5, clientY: 5 });
      pointer(host, 'pointerup', { clientX: 5, clientY: 5 });
    });
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  });

  it('重复 key 后者胜（与 GraphCanvas 同口径），不产生两个 DOM 节点', () => {
    render(
      <CanvasGraph
        rows={ROWS}
        cols={COLS}
        items={[
          { key: 'dup', row: 0, col: 0, content: <span>旧</span> },
          { key: 'dup', row: 1, col: 1, content: <span>新</span> },
        ]}
      />,
    );
    expect(screen.getAllByTestId('canvas-graph-item-dup')).toHaveLength(1);
    expect(screen.getByTestId('canvas-graph-item-dup')).toHaveTextContent('新');
  });
});

describe('拖拽平移', () => {
  it('越过阈值即跟手移动枢纽（命令式写 transform，不是等 React 重渲染）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const before = pinTransform('a');
    act(() => {
      pointer(host, 'pointerdown', { clientX: 300, clientY: 300 });
      pointer(host, 'pointermove', { clientX: 240, clientY: 330 }); // 向左 60 / 向下 30
    });
    const after = pinTransform('a');
    expect(after).not.toBe(before);
    // 1:1 跟手：位移恰好等于指针位移（无加速、无滞后）
    const xy = (s: string): number[] =>
      (/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(s) ?? []).slice(1).map(Number);
    const [x0, y0] = xy(before);
    const [x1, y1] = xy(after);
    expect(x1! - x0!).toBeCloseTo(-60, 3);
    expect(y1! - y0!).toBeCloseTo(30, 3);
    expect(host.style.cursor).toBe('grabbing'); // 拖动中光标切换
  });

  it('拖动被夹取：整图适配视图下向右拖，最多只露出 40px（图不会被拖出视野）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const before = pinTransform('a');
    act(() => {
      pointer(host, 'pointerdown', { clientX: 100, clientY: 300 });
      pointer(host, 'pointermove', { clientX: 400, clientY: 300 }); // 想向右拖 300
    });
    const after = pinTransform('a');
    const readX = (s: string): number => Number(/translate3d\((-?[\d.]+)px/.exec(s)?.[1] ?? 'NaN');
    expect(readX(after) - readX(before)).toBeCloseTo(40, 3); // 不是 300
  });

  it('阈值内（8px 死区）不移动（防误触，§12.2）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const before = pinTransform('a');
    act(() => {
      pointer(host, 'pointerdown', { clientX: 300, clientY: 300 });
      pointer(host, 'pointermove', { clientX: 305, clientY: 303 });
    });
    expect(pinTransform('a')).toBe(before);
    expect(host.style.cursor).toBe('grab');
  });
});

describe('缩放', () => {
  it('鼠标滚轮即缩放（不需要按 Ctrl），以光标为锚点', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const before = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
    expect(before).toBeGreaterThan(0);
    fireEvent.wheel(host, { deltaY: -120, clientX: 300, clientY: 300 });
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(now).toBeGreaterThan(before);
    });
  });

  it('向下滚 = 缩小（先放大才能看到缩小，整图适配就是下界）', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const read = (): number =>
      Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
    const fit = read();
    fireEvent.wheel(host, { deltaY: -120, clientX: 300, clientY: 300 });
    let zoomed = fit;
    // 等到**确实比 fit 大**再取值：否则会读到动画还没推进的 fit 值（第一版就这么栽的）
    await waitFor(() => {
      zoomed = read();
      expect(zoomed).toBeGreaterThan(fit);
    });
    fireEvent.wheel(host, { deltaY: 120, clientX: 300, clientY: 300 });
    await waitFor(() => {
      expect(read()).toBeLessThan(zoomed);
    });
  });

  it('缩放下界 = 整图适配：fit 视图下继续向下滚不会比整图更小（图不会缩没）', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const fit = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
    // 到底了就不消费滚轮 → 交回页面滚动（fireEvent 返回 false 表示被 preventDefault）
    expect(fireEvent.wheel(host, { deltaY: 480, clientX: 300, clientY: 300 })).toBe(true);
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(now).toBeGreaterThanOrEqual(fit - 1);
    });
  });

  it('内置控件（触屏唯一可见的缩放入口）：放大 → 复位', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const fit = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
    fireEvent.click(screen.getByTestId('canvas-graph-zoom-in'));
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(now).toBeGreaterThan(fit);
    });
    fireEvent.click(screen.getByTestId('canvas-graph-reset'));
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(Math.abs(now - fit)).toBeLessThanOrEqual(1);
    });
  });

  it('showControls=false 时不渲染控件（消费方可自管入口）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} showControls={false} />);
    expect(screen.queryByTestId('canvas-graph-controls')).toBeNull();
  });

  it('**双指捏合缩放**：两指距离拉大 → 放大', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const before = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
    act(() => {
      pointer(host, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 300 });
      pointer(host, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 300 });
      pointer(host, 'pointermove', { pointerId: 2, clientX: 400, clientY: 300 }); // 距离 ×2
    });
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(now).toBeGreaterThan(before);
    });
  });

  it('双指捏合缩小（距离收紧）→ 缩小；且不低于整图适配（夹取下界）', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    const fit = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
    act(() => {
      pointer(host, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
      pointer(host, 'pointerdown', { pointerId: 2, clientX: 500, clientY: 300 });
      pointer(host, 'pointermove', { pointerId: 2, clientX: 200, clientY: 300 });
    });
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(now).toBeGreaterThanOrEqual(fit - 1);
    });
  });

  it('缩放期间不选中（拖动/捏合都不算点击）', () => {
    const onSelect = vi.fn();
    render(
      <CanvasGraph rows={ROWS} cols={COLS} items={ITEMS.map((item) => ({ ...item, onSelect }))} />,
    );
    const host = screen.getByTestId('canvas-graph');
    act(() => {
      pointer(host, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 300 });
      pointer(host, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 300 });
      pointer(host, 'pointermove', { pointerId: 2, clientX: 400, clientY: 300 });
      pointer(host, 'pointerup', { pointerId: 2, clientX: 400, clientY: 300 });
      pointer(host, 'pointerup', { pointerId: 1, clientX: 200, clientY: 300 });
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('滚轮的「到边界就还给页面」', () => {
  it('⭐ 已在整图适配下界还要缩小 → 不消费滚轮（否则鼠标停在画布上就永远滚不动页面）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    // fit 即下界：继续向下滚不该被吃掉（fireEvent 返回 true = 未 preventDefault）
    expect(fireEvent.wheel(host, { deltaY: 300, clientX: 300, clientY: 300 })).toBe(true);
  });

  it('还能缩放时正常消费滚轮（否则页面会跟着一起滚，缩放抖动）', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    // 向上滚 = 放大，此时未到上界 → 应被消费
    expect(fireEvent.wheel(host, { deltaY: -120, clientX: 300, clientY: 300 })).toBe(false);
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(now).toBeGreaterThan(0);
    });
  });

  it('放大到上界后继续向上滚 → 同样还给页面', async () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    // 一口气顶到 maxZoom（相对 zoom_fit 的 4 倍）
    for (let i = 0; i < 40; i += 1) fireEvent.wheel(host, { deltaY: -120, clientX: 300, clientY: 300 });
    await waitFor(() => {
      const now = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(now).toBeGreaterThan(0);
    });
    // 动画收敛后再滚一次：应已在上界 → 不消费
    await waitFor(() => expect(fireEvent.wheel(host, { deltaY: -120, clientX: 300, clientY: 300 })).toBe(true));
  });

  it('deltaY 为 0 的滚轮事件既不缩放也不消费（某些设备会发这种事件）', () => {
    render(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />);
    const host = screen.getByTestId('canvas-graph');
    expect(fireEvent.wheel(host, { deltaY: 0, clientX: 300, clientY: 300 })).toBe(true);
  });
});

describe('⭐ 量化对照：同一段 60 帧拖动，React 提交次数', () => {
  /**
   * 每个 pointermove **单独一次 `act()`**：浏览器里每次指针事件是一个独立任务，
   * React 18 的自动批处理只在单个事件内生效 —— 因此逐事件 act 才是真实模型。
   */
  function countDragCommits(node: ReactElement, hostTestId: string): number {
    let commits = 0;
    render(<ReactProfiler id="probe" onRender={() => (commits += 1)}>{node}</ReactProfiler>);
    const host = screen.getByTestId(hostTestId);
    act(() => {
      pointer(host, 'pointerdown', { clientX: 300, clientY: 300 });
      pointer(host, 'pointermove', { clientX: 311, clientY: 300 }); // 越过 8px 阈值
    });
    const afterThreshold = commits;
    for (let i = 1; i <= 60; i += 1) {
      act(() => {
        pointer(host, 'pointermove', { clientX: 311 + i * 3, clientY: 300 });
      });
    }
    const during = commits - afterThreshold;
    act(() => {
      pointer(host, 'pointerup', { clientX: 491, clientY: 300 });
    });
    return during;
  }

  it('CanvasGraph：拖动 60 帧 = **0 次 React 提交**（位姿走命令式写入）', () => {
    const commits = countDragCommits(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />, 'canvas-graph');
    expect(commits).toBe(0);
  });

  it('旧 GraphCanvas：同样 60 帧 = 每帧一次 React 提交（基线，用于对照）', () => {
    const commits = countDragCommits(<GraphCanvas rows={ROWS} cols={COLS} items={ITEMS} />, 'graph-canvas');
    // 这条**记录基线**而不是追求某个数字：旧实现每帧 setPan ⇒ 每帧一次提交
    // eslint-disable-next-line no-console
    console.info(`[手感基线] 60 帧拖动 React 提交次数：CanvasGraph=0，GraphCanvas=${commits}`);
    expect(commits).toBeGreaterThanOrEqual(50);
  });

  it('新实现严格优于旧实现（同一次运行的直接对比，不依赖上面两个数字）', () => {
    const next = countDragCommits(<CanvasGraph rows={ROWS} cols={COLS} items={ITEMS} />, 'canvas-graph');
    const prev = countDragCommits(<GraphCanvas rows={ROWS} cols={COLS} items={ITEMS} />, 'graph-canvas');
    expect(next).toBeLessThan(prev);
  });
});
