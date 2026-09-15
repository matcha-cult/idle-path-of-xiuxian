/**
 * `MapStagePage` 单测 —— 断言的是**用户在这一页上能看到什么**，而不是实现细节：
 * 口径文字上屏、网格真的按 42 格算出来、鼠标移到某格读数就报那一格、窗口太小则显示 `—`。
 *
 * jsdom 没有 2D 上下文、也不认 `PointerEvent`：用最小的假上下文 + 继承 `MouseEvent` 的
 * `PointerEvent` 补上（不引入原生 canvas 包）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStagePage } from './MapStagePage.js';

/** 可用区域 500×500 ⇒ 每格 floor((500-52)/42) = 10px ⇒ 画布 42×10+52 = 472。 */
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
    arc: noop,
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
  it('口径上屏：明确写出「42 个小格子 / 每轴 43 条线 / 坐标 0-based」', () => {
    render(<MapStagePage />);
    const intro = screen.getByText(/每轴 42 个小格子/);
    expect(intro).toHaveTextContent('每轴 43 条网格线');
    expect(intro).toHaveTextContent('0-based');
  });

  it('按 42 格算出整数格宽与画布尺寸（500×500 ⇒ 每格 10px、画布 472）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid-root').getAttribute('data-cell-px')).toBe('10');
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('472');
  });

  it('读数端到端接通（onMetrics 真的把几何交给页面）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('10 px');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('472 × 472 CSS');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
  });

  it('⭐ 中心圆读数：42 格的中心在 (236, 236)，直径 = 1 格 = 10px', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-mark')).toHaveTextContent('(236, 236) · Ø 10 px');
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

  it('窗口太小（容器 0×0）⇒ 读数显示 —，画布 0×0，且不抛错', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(0, 0));
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('0');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('—');
  });
});
