/**
 * GraphCanvas 组件：两层缩放（枢纽恒定屏幕尺寸）、点击只选中、拖动 >8px 不算点击、
 * Ctrl/⌘+滚轮才缩放、空白点击回调、开发者网格（点阵 + 轴标 + 坐标）、边界输入不崩。
 *
 * jsdom 没有 ResizeObserver / getBoundingClientRect 真实尺寸，这里统一打桩成 660×660 ——
 * 这样 `zoom_fit = 660 / (22 × 48) = 0.625`，位置断言可以精确到小数。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GraphCanvas } from './index.js';

const VIEW = { w: 660, h: 660 };

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
    x: 0, y: 0, left: 0, top: 0, right: VIEW.w, bottom: VIEW.h, width: VIEW.w, height: VIEW.h,
    toJSON: () => ({}),
  } as DOMRect);
});


/**
 * jsdom 的 `PointerEvent` 不带 `pointerId` / `clientX/Y`（实测全为 null），
 * `pointer(..., 'pointerdown', { clientX })` 因此**根本传不进位移**。
 * 这里手工造一个带这些属性的普通 `Event` 派发 —— React 18 的 onPointer* 会照常触发。
 */
function pointer(node: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: Record<string, unknown>): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, ...init });
  node.dispatchEvent(event);
}

const ITEMS = [
  { key: 'a', row: 0, col: 0, content: <span>A</span> },
  { key: 'b', row: 21, col: 21, content: <span>B</span>, title: '乙' },
  { key: 'c', row: 10, col: 10, content: <span>C</span>, disabled: true },
];

function worldTransform(container: HTMLElement): string {
  return (container.querySelector('[data-testid="graph-canvas-world"]') as HTMLElement).style.transform;
}
function itemStyle(container: HTMLElement, key: string): CSSStyleDeclaration {
  return (container.querySelector(`[data-testid="graph-canvas-item-${key}"]`) as HTMLElement).style;
}

describe('GraphCanvas · 渲染与缩放口径', () => {
  it('渲染枢纽与连线；世界层按 zoom_fit 整图适配', () => {
    const { container } = render(
      <GraphCanvas rows={21} cols={21} items={ITEMS} links={[{ from: 'a', to: 'b' }]} />,
    );
    expect(screen.getByTestId('graph-canvas-item-a')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas-link')).toBeInTheDocument();
    // 660 / (22×48) = 0.625；平移 (660 - 1056×0.625)/2 = 0
    expect(worldTransform(container)).toBe('translate(0px, 0px) scale(0.625)');
  });

  it('枢纽图标恒定屏幕尺寸：左上是坐标 × cellPx（左端 0px），图标自身没有 scale', () => {
    const { container } = render(<GraphCanvas rows={21} cols={21} items={ITEMS} />);
    const a = itemStyle(container, 'a');
    expect(a.left).toBe('0px');
    expect(a.top).toBe('0px');
    expect(a.transform).toBe('translate(-50%, -50%)');
    // 右下交叉点 (21,21) → 21×48×0.625 = 630
    expect(itemStyle(container, 'b').left).toBe('630px');
    expect(itemStyle(container, 'b').top).toBe('630px');
  });

  it('普通滚轮不劫持页面滚动（不改变 transform）', () => {
    const { container } = render(<GraphCanvas rows={21} cols={21} items={ITEMS} />);
    const before = worldTransform(container);
    fireEvent.wheel(screen.getByTestId('graph-canvas'), { deltaY: -100, clientX: 100, clientY: 100 });
    expect(worldTransform(container)).toBe(before);
  });

  it('Ctrl + 滚轮放大（且以光标为锚点，transform 变化）', () => {
    const { container } = render(<GraphCanvas rows={21} cols={21} items={ITEMS} />);
    const before = worldTransform(container);
    fireEvent.wheel(screen.getByTestId('graph-canvas'), {
      deltaY: -100, ctrlKey: true, clientX: 300, clientY: 300,
    });
    expect(worldTransform(container)).not.toBe(before);
    expect(worldTransform(container)).toContain('scale(0.71875)');
  });
});

describe('GraphCanvas · 点击只选中（§12.1）', () => {
  it('点击枢纽触发 onSelect（且不触发 onBackgroundClick）', () => {
    const onSelect = vi.fn();
    const onBackground = vi.fn();
    render(
      <GraphCanvas
        rows={21}
        cols={21}
        items={[{ key: 'a', row: 5, col: 5, content: <span>A</span>, onSelect }]}
        onBackgroundClick={onBackground}
      />,
    );
    const host = screen.getByTestId('graph-canvas');
    pointer(host, 'pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
    pointer(host, 'pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
    // 命中判定看事件 target：直接对枢纽节点派发才会命中
    expect(onBackground).toHaveBeenCalledTimes(1);
    onSelect.mockClear();
    const pin = screen.getByTestId('graph-canvas-item-a');
    pointer(pin, 'pointerdown', { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    pointer(pin, 'pointerup', { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onBackground).toHaveBeenCalledTimes(1);
  });

  it('pointer 位移 > 8px 视为拖动：不触发 onSelect，也不触发空白点击', () => {
    const onSelect = vi.fn();
    const onBackground = vi.fn();
    render(
      <GraphCanvas
        rows={21}
        cols={21}
        items={[{ key: 'a', row: 5, col: 5, content: <span>A</span>, onSelect }]}
        onBackgroundClick={onBackground}
      />,
    );
    const pin = screen.getByTestId('graph-canvas-item-a');
    pointer(pin, 'pointerdown', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
    pointer(pin, 'pointermove', { pointerId: 3, pointerType: 'mouse', clientX: 120, clientY: 130 });
    pointer(pin, 'pointerup', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 120, clientY: 130 });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBackground).not.toHaveBeenCalled();
  });

  it('恰好 8px 位移仍算点击（阈值是「超过」）', () => {
    const onSelect = vi.fn();
    render(
      <GraphCanvas rows={21} cols={21} items={[{ key: 'a', row: 5, col: 5, content: <span>A</span>, onSelect }]} />,
    );
    const pin = screen.getByTestId('graph-canvas-item-a');
    pointer(pin, 'pointerdown', { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
    pointer(pin, 'pointermove', { pointerId: 4, pointerType: 'mouse', clientX: 8, clientY: 0 });
    pointer(pin, 'pointerup', { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 8, clientY: 0 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disabled 枢纽：点击与键盘都不触发 onSelect，且不可聚焦', () => {
    const onSelect = vi.fn();
    render(
      <GraphCanvas
        rows={21}
        cols={21}
        items={[{ key: 'x', row: 1, col: 1, content: <span>X</span>, onSelect, disabled: true }]}
      />,
    );
    const pin = screen.getByTestId('graph-canvas-item-x');
    expect(pin).toHaveAttribute('tabindex', '-1');
    pointer(pin, 'pointerdown', { pointerId: 5, pointerType: 'mouse', button: 0 });
    pointer(pin, 'pointerup', { pointerId: 5, pointerType: 'mouse', button: 0 });
    fireEvent.keyDown(pin, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('键盘 Enter / Space 触发选中（等价轻点）', () => {
    const onSelect = vi.fn();
    render(
      <GraphCanvas rows={21} cols={21} items={[{ key: 'a', row: 2, col: 2, content: <span>A</span>, onSelect }]} />,
    );
    const pin = screen.getByTestId('graph-canvas-item-a');
    fireEvent.keyDown(pin, { key: 'Enter' });
    fireEvent.keyDown(pin, { key: ' ' });
    fireEvent.keyDown(pin, { key: 'Escape' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('GraphCanvas · 拖动抑制（修用户实测 B2 / B3）', () => {
  it('容器 userSelect=none + -webkit-user-drag=none：鼠标拖动不得产生文本选区', () => {
    render(<GraphCanvas rows={4} cols={4} items={ITEMS} />);
    const host = screen.getByTestId('graph-canvas');
    expect(host.style.userSelect).toBe('none');
    // `WebkitUserSelect` 会被 jsdom 的 cssstyle 归一化掉（读不回来），但 `WebkitUserDrag` 可断言 ——
    // 两者走的是同一条「React 前缀属性 → CSS 前缀属性」路径。
    expect(host.style.getPropertyValue('-webkit-user-drag')).toBe('none');
    expect(host.getAttribute('style')).toContain('-webkit-user-drag');
  });

  it('SVG 层也 userSelect=none（开发者网格的轴标是 <text> 节点）', () => {
    const { container } = render(<GraphCanvas rows={4} cols={4} items={ITEMS} showGrid />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.style.userSelect).toBe('none');
  });

  it('onPointerDown 第一行就 preventDefault —— 原生选区/拖拽不会起步', () => {
    render(<GraphCanvas rows={4} cols={4} items={ITEMS} />);
    const host = screen.getByTestId('graph-canvas');
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('枢纽 draggable=false 且 onDragStart 被阻止（按在文字上拖不触发 HTML5 拖拽）', () => {
    render(<GraphCanvas rows={4} cols={4} items={[{ key: 'a', row: 1, col: 1, content: <span>A</span> }]} />);
    const pin = screen.getByTestId('graph-canvas-item-a');
    expect(pin).toHaveAttribute('draggable', 'false');
    expect(pin.draggable).toBe(false);
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    pin.dispatchEvent(dragStart);
    expect(dragStart.defaultPrevented).toBe(true);
  });

  it('拖动中光标 grabbing（容器 + 枢纽），松手回 grab', () => {
    render(<GraphCanvas rows={5} cols={5} items={[{ key: 'a', row: 1, col: 1, content: <span>A</span> }]} />);
    const host = screen.getByTestId('graph-canvas');
    expect(host.style.cursor).toBe('grab');
    // 状态更新（setDragging）必须包在 act 里，否则读不到重渲染后的 style
    act(() => {
      pointer(host, 'pointerdown', { pointerId: 9, clientX: 0, clientY: 0 });
      pointer(host, 'pointermove', { pointerId: 9, clientX: 40, clientY: 0 });
    });
    expect(host.style.cursor).toBe('grabbing');
    expect(screen.getByTestId('graph-canvas-item-a').style.cursor).toBe('grabbing');
    act(() => {
      pointer(host, 'pointerup', { pointerId: 9, clientX: 40, clientY: 0 });
    });
    expect(host.style.cursor).toBe('grab');
    expect(screen.getByTestId('graph-canvas-item-a').style.cursor).toBe('pointer');
  });
});

describe('GraphCanvas · 开发者网格（§13）', () => {
  it('showGrid=false（缺省）不渲染网格与坐标', () => {
    render(<GraphCanvas rows={4} cols={4} items={ITEMS} />);
    expect(screen.queryByTestId('graph-canvas-grid')).toBeNull();
    expect(screen.queryByTestId('graph-canvas-item-coord-a')).toBeNull();
  });

  it('showGrid=true 渲染 (n+1)² 个交叉点、(n+1) 个列号行号与每个枢纽坐标', () => {
    render(<GraphCanvas rows={4} cols={4} items={ITEMS} showGrid />);
    expect(screen.getByTestId('graph-canvas-grid')).toHaveAttribute('data-grid', '4x4');
    expect(screen.getAllByTestId('graph-canvas-grid-point')).toHaveLength(25);
    expect(screen.getAllByTestId('graph-canvas-axis-col')).toHaveLength(5);
    expect(screen.getAllByTestId('graph-canvas-axis-row')).toHaveLength(5);
    expect(screen.getByTestId('graph-canvas-item-coord-b')).toHaveTextContent('21,21');
    expect(screen.getByTestId('graph-canvas-item-coord-c')).toHaveTextContent('10,10');
  });

  it('轴标是 0-based（含两端）：首个列号为 0', () => {
    render(<GraphCanvas rows={1} cols={1} items={[]} showGrid />);
    expect(screen.getAllByTestId('graph-canvas-axis-col')[0]).toHaveTextContent('0');
    expect(screen.getAllByTestId('graph-canvas-axis-row')[0]).toHaveTextContent('0');
    expect(screen.getAllByTestId('graph-canvas-grid-point')).toHaveLength(4);
  });
});

describe('GraphCanvas · 边界输入不崩、不产出 NaN', () => {
  it('rows/cols ≤ 0、items 空、links 空', () => {
    const { container } = render(<GraphCanvas rows={0} cols={-3} items={[]} links={[]} />);
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    expect(worldTransform(container)).not.toContain('NaN');
  });

  it('links 指向不存在的 key 都不崩；重复 key 后者胜（不产出重复 DOM 节点）', () => {
    const { container } = render(
      <GraphCanvas
        rows={5}
        cols={5}
        items={[
          { key: 'dup', row: 1, col: 1, content: <span>1</span> },
          { key: 'dup', row: 2, col: 2, content: <span>2</span> },
        ]}
        links={[{ from: 'dup', to: 'ghost' }, { from: 'ghost', to: 'ghost' }]}
      />,
    );
    expect(screen.getAllByTestId('graph-canvas-item-dup')).toHaveLength(1);
    expect(screen.queryAllByTestId('graph-canvas-link')).toHaveLength(0);
    expect(worldTransform(container)).not.toContain('NaN');
  });

  it('坐标越界的枢纽仍渲染（交给容器裁剪），不产出 NaN 位置', () => {
    const { container } = render(
      <GraphCanvas rows={5} cols={5} items={[{ key: 'far', row: 99, col: -4, content: <span>F</span> }]} />,
    );
    const pin = itemStyle(container, 'far');
    expect(pin.left).not.toContain('NaN');
    expect(pin.top).not.toContain('NaN');
  });

  it('非法 cellPx（0 / 负 / NaN）回退 48，世界尺寸仍有限', () => {
    for (const cellPx of [0, -8, Number.NaN]) {
      const { container, unmount } = render(<GraphCanvas rows={2} cols={2} items={[]} cellPx={cellPx} />);
      expect(worldTransform(container)).not.toContain('NaN');
      unmount();
    }
  });

  it('ariaLabel 缺省为「图形画布」，自定义时生效', () => {
    render(<GraphCanvas rows={1} cols={1} items={[]} />);
    expect(screen.getByRole('application')).toHaveAttribute('aria-label', '图形画布');
    render(<GraphCanvas rows={1} cols={1} items={[]} ariaLabel="青云宗地图" />);
    expect(screen.getAllByRole('application')[1]).toHaveAttribute('aria-label', '青云宗地图');
  });
});
