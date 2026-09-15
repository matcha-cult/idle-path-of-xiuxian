/**
 * `MapStagePage` 单测 —— 断言的是**这一页交付了什么**，而且刻意断言到"画布上真的调了哪些 arc"：
 * 42×42 网格、半径 9 格的轨道环、9 个点（1 主峰 + 8 功能峰）、以及坐标读数与点位读数。
 *
 * 为什么连 arc 都要断言：纯 canvas 在 DevTools 里没有 DOM，页面读数只覆盖"几何与环境"，
 * 而"环到底画没画、点落在哪"只能靠这一类调用次序/坐标断言兜住 —— 否则就要靠人在浏览器里数。
 * jsdom 没有 2D 上下文，这里用最小的假上下文 + 继承 MouseEvent 的 PointerEvent 补上。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStagePage } from './MapStagePage.js';

/** 可用区域 500×500 ⇒ 每格 floor((500-52)/42) = 10px ⇒ 世界原点 (236,236)。 */
const SIZE = 500;

function domRect(w: number, h: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    width: w,
    height: h,
    toJSON: () => ({}),
  } as DOMRect;
}

/** 记录 arc 调用：环与点的位置/半径都在这里被断言。 */
let arcs: string[] = [];

function fakeContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  return {
    save: noop,
    restore: noop,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    arc: (x: number, y: number, r: number) => arcs.push(`arc(${x},${y},${r})`),
    setLineDash: noop,
    fillText: noop,
    measureText: (text: string) => ({ width: text.length * 6 }),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  arcs = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => fakeContext()) as unknown as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(SIZE, SIZE));
  if (typeof window.PointerEvent === 'undefined') {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MapStagePage', () => {
  it('口径上屏：42 格 / 每轴 43 条线 / 半径 9 格轨道 / 8 等分 8 峰', () => {
    render(<MapStagePage />);
    const intro = screen.getByText(/每轴 42 个小格子/);
    expect(intro).toHaveTextContent('每轴 43 条网格线');
    expect(intro).toHaveTextContent('半径 9 格的轨道');
    expect(intro).toHaveTextContent('8 等分');
  });

  it('按 42 格算出整数格宽与画布尺寸（500×500 ⇒ 每格 10px、画布 472）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid-root').getAttribute('data-cell-px')).toBe('10');
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('472');
  });

  it('⭐ 轨道环半径 9 格 ⇒ 90px，圆心在世界原点', () => {
    render(<MapStagePage />);
    // 9 格 × 10px = 90px
    expect(arcs).toContain('arc(236,236,90)');
  });

  it('⭐ 9 个点都画出来（直径 1 格 ⇒ 半径 5px），位置按世界坐标 + y 向上', () => {
    render(<MapStagePage />);
    // 1 个环 + 9 个点 = 10 次 arc
    expect(arcs).toHaveLength(10);
    // 主峰：世界原点
    expect(arcs).toContain('arc(236,236,5)');
    // 功能峰·东 (9,0) ⇒ 屏幕 (236+90, 236)
    expect(arcs).toContain('arc(326,236,5)');
    // 功能峰·北 (0,9) ⇒ 屏幕 y 减小（y 向上）
    expect(arcs).toContain('arc(236,146,5)');
    // 功能峰·南 (0,-9) ⇒ 屏幕 y 增大
    expect(arcs).toContain('arc(236,326,5)');
    // 功能峰·东北 (6.364,6.364) ⇒ 屏幕 (236+63.64, 236−63.64)：斜向点是无理数，
    // 用前缀/正则断言到 0.01px，避免把浮点尾数写死在期望值里
    expect(arcs.some((call) => /^arc\(299\.63\d+,172\.36\d+,5\)$/.test(call))).toBe(true);
  });

  it('读数端到端接通（onMetrics 真的把几何交给页面）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('10 px');
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('(236, 236) px');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('472 × 472 CSS');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
  });

  it('⭐ 9 个点位的坐标全部上屏（可从页面直接核对 8 等分）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-points').children).toHaveLength(9);
    expect(screen.getByTestId('stage-point-summit')).toHaveTextContent('主峰 (0, 0)');
    expect(screen.getByTestId('stage-point-peak_3')).toHaveTextContent('功能峰·北 (0, 9)');
  });

  it('⭐ 鼠标移到某格 ⇒ 读数报出那一格；移出 ⇒ 回到 —', () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');

    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 60 });
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 07 / 行 03');

    fireEvent.pointerLeave(canvas);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');
  });

  it('窗口太小（容器 0×0）⇒ 读数 —、画布 0×0、一个 arc 都不画，且不抛错', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(0, 0));
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('0');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(arcs).toEqual([]);
  });
});
