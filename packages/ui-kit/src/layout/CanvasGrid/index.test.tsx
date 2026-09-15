/**
 * `CanvasGrid` 单测 —— 组件的**契约**都在这里钉死：
 *
 * - 几何（格宽 / 画布尺寸）以 `data-*` 印在 DOM 上，供人排查（canvas 内部不可见）；
 * - **受控**：高亮只由 `value` 决定，hover 只经 `onHoverCell` 上报，**同一格内不重复上报**；
 * - 边界：pad 区 / 出界 ⇒ 报 null；`getContext` 返回 null ⇒ 静默降级；空间不足 ⇒ 0×0 且不画线；
 * - DPR 放大的是**位图**，不是屏幕尺寸（否则布局会随显示器密度变形）；
 * - `touchAction: 'none'` 已经先在（后面加捏合缩放时，浏览器默认手势会把 pinch 吃掉）。
 *
 * jsdom 没有 2D 上下文，也不认 `PointerEvent`：这里分别用「记录调用的假上下文」和
 * 「继承 MouseEvent 的最小 PointerEvent」补上 —— 不引入原生 canvas 包。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CanvasGrid } from './index.js';
import type { GridMetrics } from './index.js';
import type { GridCell } from './geometry.js';

const SIZE = 100;

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

interface Recorder {
  ctx: CanvasRenderingContext2D;
  calls: string[];
}

function makeRecorder(): Recorder {
  const calls: string[] = [];
  const raw = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    setTransform: (a: number) => calls.push(`setTransform(${a})`),
    clearRect: () => calls.push('clearRect'),
    fillRect: () => calls.push('fillRect'),
    strokeRect: () => calls.push('strokeRect'),
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    stroke: () => calls.push('stroke'),
    fill: () => calls.push('fill'),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    fillText: (text: string) => calls.push(`fillText:${text}`),
    measureText: (text: string) => ({ width: text.length * 6 }),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  };
  return { ctx: raw as unknown as CanvasRenderingContext2D, calls };
}

let rec: Recorder;

beforeEach(() => {
  rec = makeRecorder();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => rec.ctx) as unknown as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(SIZE, SIZE));
  if (typeof window.PointerEvent === 'undefined') {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true, writable: true });
});

const lastMetrics = (spy: ReturnType<typeof vi.fn>): GridMetrics => spy.mock.calls.at(-1)?.[0] as GridMetrics;

describe('渲染与几何读数', () => {
  it('2×2 格 + 容器 100×100 ⇒ 每格 24px、画布 100×100（含两侧 pad 26）', () => {
    render(<CanvasGrid rows={2} cols={2} />);
    const canvas = screen.getByTestId('canvas-grid');
    expect(screen.getByTestId('canvas-grid-root').getAttribute('data-cell-px')).toBe('24');
    expect(canvas.getAttribute('data-canvas-w')).toBe('100');
    expect(canvas.getAttribute('data-canvas-h')).toBe('100');
  });

  it('无高亮时 data-hover 为空串（而不是 "null" 或 "undefined"）', () => {
    render(<CanvasGrid rows={2} cols={2} />);
    expect(screen.getByTestId('canvas-grid').getAttribute('data-hover')).toBe('');
  });

  it('canvas 有 role/aria-label（内部像素对读屏不可见，至少要报出「多大的网格」）', () => {
    render(<CanvasGrid rows={2} cols={2} label="地图网格" />);
    const canvas = screen.getByTestId('canvas-grid');
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('地图网格：2 × 2 格');
  });

  it('touchAction: none 已经先在（否则后面加捏合缩放时浏览器会把 pinch 吃掉）', () => {
    render(<CanvasGrid rows={2} cols={2} />);
    expect((screen.getByTestId('canvas-grid') as HTMLCanvasElement).style.touchAction).toBe('none');
  });

  it('onMetrics 报出几何与环境（纯 canvas 没有 DOM 可查，这是唯一的事实出口）', () => {
    const onMetrics = vi.fn();
    render(<CanvasGrid rows={2} cols={2} onMetrics={onMetrics} />);
    expect(lastMetrics(onMetrics)).toEqual({
      cellPx: 24,
      width: 100,
      height: 100,
      bitmapWidth: 100,
      bitmapHeight: 100,
      dpr: 1,
      axisLineCount: 3,
      centerX: 50,
      centerY: 50,
      usable: true,
    });
  });

  it('⭐ 坐标系中心画一个「直径 = 1 格」的圆，且压在网格线之上', () => {
    render(<CanvasGrid rows={2} cols={2} />);
    // 2 格 + pad 26 + 格宽 24 ⇒ 圆心 (26 + 24, 26 + 24) = (50,50)，半径 24 / 2 = 12
    expect(rec.calls).toContain('arc(50,50,12)');
    expect(rec.calls.filter((c) => c === 'fill')).toHaveLength(1);
    // 层序：网格的 stroke 早于中心圆的 arc（"圆在网格之上"）
    expect(rec.calls.lastIndexOf('stroke')).toBeLessThan(rec.calls.indexOf('arc(50,50,12)'));
  });

  it('DPR=2 放大的是位图，不是屏幕尺寸', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true, writable: true });
    const onMetrics = vi.fn();
    render(<CanvasGrid rows={2} cols={2} onMetrics={onMetrics} />);
    const canvas = screen.getByTestId('canvas-grid') as HTMLCanvasElement;
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(200);
    expect(canvas.getAttribute('data-canvas-w')).toBe('100');
    expect(lastMetrics(onMetrics).bitmapWidth).toBe(200);
  });

  it('真的画了：清屏 + 两次 stroke（细线一遍、主线一遍）', () => {
    render(<CanvasGrid rows={2} cols={2} />);
    expect(rec.calls).toContain('clearRect');
    expect(rec.calls.filter((c) => c === 'stroke')).toHaveLength(2);
  });
});

describe('hover 上报（受控）', () => {
  it('落到哪一格就报哪一格；同一格内移动不重复上报', () => {
    const onHover = vi.fn();
    render(<CanvasGrid rows={2} cols={2} onHoverCell={onHover} />);
    const canvas = screen.getByTestId('canvas-grid');

    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30 });
    expect(onHover).toHaveBeenLastCalledWith({ col: 0, row: 0 });
    expect(onHover).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(canvas, { clientX: 31, clientY: 31 });
    expect(onHover).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 });
    expect(onHover).toHaveBeenLastCalledWith({ col: 1, row: 1 });
    expect(onHover).toHaveBeenCalledTimes(2);
  });

  it('pad 区（网格之外）⇒ 报 null，而不是把它算成边界格', () => {
    const onHover = vi.fn();
    render(<CanvasGrid rows={2} cols={2} onHoverCell={onHover} />);
    const canvas = screen.getByTestId('canvas-grid');

    // 一开始就在 pad 里：本来就"没有格子"，不该凭空报一个 (0,0)
    fireEvent.pointerMove(canvas, { clientX: 5, clientY: 30 });
    expect(onHover).not.toHaveBeenCalled();

    // 进网格再回到 pad：先报该格，再报 null（页面据此把读数清成 —）
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30 });
    expect(onHover).toHaveBeenLastCalledWith({ col: 0, row: 0 });
    fireEvent.pointerMove(canvas, { clientX: 5, clientY: 30 });
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(onHover).toHaveBeenCalledTimes(2);
  });

  it('移出网格 ⇒ 报一次 null；再移出不会重复报（避免上层被 null 刷爆）', () => {
    const onHover = vi.fn();
    render(<CanvasGrid rows={2} cols={2} onHoverCell={onHover} />);
    const canvas = screen.getByTestId('canvas-grid');
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 });
    fireEvent.pointerLeave(canvas);
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(onHover).toHaveBeenCalledTimes(2);
    fireEvent.pointerLeave(canvas);
    expect(onHover).toHaveBeenCalledTimes(2);
  });

  it('受控往返：父组件持有状态时 data-hover 跟着变，移出回到空', () => {
    function Harness(): React.ReactElement {
      const [cell, setCell] = useState<GridCell | null>(null);
      return <CanvasGrid rows={2} cols={2} value={cell} onHoverCell={setCell} />;
    }
    render(<Harness />);
    const canvas = screen.getByTestId('canvas-grid');
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 });
    expect(canvas.getAttribute('data-hover')).toBe('1,1');
    fireEvent.pointerLeave(canvas);
    expect(canvas.getAttribute('data-hover')).toBe('');
  });

  it('纯受控：没有 onHoverCell 时 hover 不会自己改高亮（组件不偷偷存状态）', () => {
    render(<CanvasGrid rows={2} cols={2} value={{ col: 0, row: 1 }} />);
    const canvas = screen.getByTestId('canvas-grid');
    expect(canvas.getAttribute('data-hover')).toBe('0,1');
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 });
    expect(canvas.getAttribute('data-hover')).toBe('0,1');
  });
});

describe('画布内坐标标签', () => {
  function Harness(): React.ReactElement {
    const [cell, setCell] = useState<GridCell | null>(null);
    return <CanvasGrid rows={2} cols={2} value={cell} onHoverCell={setCell} />;
  }

  it('hover 时在画布内画「列,行」（轴标只有单个数字，所以 "1,1" 只可能来自标签）', () => {
    render(<Harness />);
    fireEvent.pointerMove(screen.getByTestId('canvas-grid'), { clientX: 60, clientY: 60 });
    expect(rec.calls).toContain('fillText:1,1');
  });

  it('showCursorLabel={false} ⇒ 只高亮不画标签', () => {
    function NoLabel(): React.ReactElement {
      const [cell, setCell] = useState<GridCell | null>(null);
      return <CanvasGrid rows={2} cols={2} value={cell} onHoverCell={setCell} showCursorLabel={false} />;
    }
    render(<NoLabel />);
    fireEvent.pointerMove(screen.getByTestId('canvas-grid'), { clientX: 60, clientY: 60 });
    expect(rec.calls).not.toContain('fillText:1,1');
    expect(rec.calls).toContain('strokeRect');
  });
});

describe('降级路径', () => {
  it('getContext 返回 null（jsdom / 极端环境）⇒ 静默降级，不抛错', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    expect(() => render(<CanvasGrid rows={2} cols={2} />)).not.toThrow();
    expect(rec.calls).toEqual([]);
  });

  it('空间不足（42 格塞进 20×20）⇒ 画布 0×0、usable=false、一条线都不画', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(20, 20));
    const onMetrics = vi.fn();
    render(<CanvasGrid rows={42} cols={42} onMetrics={onMetrics} />);
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('0');
    expect(lastMetrics(onMetrics).usable).toBe(false);
    expect(rec.calls.filter((c) => c === 'stroke')).toHaveLength(0);
  });
});
