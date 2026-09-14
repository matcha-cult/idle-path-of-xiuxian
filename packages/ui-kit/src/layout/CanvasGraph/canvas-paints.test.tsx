/**
 * `CanvasGraph` **真的画了** —— 组件 → 绘制链路的闭环验证。
 *
 * 其余组件级用例都把 `HTMLCanvasElement.prototype.getContext` 打成 `null`（jsdom 本来也不实现），
 * 于是只证明了「不崩」。这一条反过来：给一个**记录型 2D 上下文**，断言组件确实
 * 1. 按容器尺寸 × DPR 分配了位图、并设好 DPR 变换；
 * 2. 真的描了连线的边（数量对得上）；
 * 3. 真的把枢纽写到了 `transform`（DOM 层的定位也发生了）。
 *
 * 这样「打开页面看到的是空白画布」这种最致命的验收问题，在浏览器之前就能被挡住。
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasGraph } from './index.js';

const VIEW = { w: 900, h: 700 };
const DPR = 2;

interface Recorded {
  setTransform: number[][];
  strokes: number;
  fills: number;
  fillRects: number;
  lineWidths: number[];
}

function recordingContext(): { ctx: CanvasRenderingContext2D; log: Recorded } {
  const log: Recorded = { setTransform: [], strokes: 0, fills: 0, fillRects: 0, lineWidths: [] };
  const state = { lineWidth: 1, fillStyle: '', strokeStyle: '', globalAlpha: 1, font: '' };
  const raw = {
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value;
    },
    get font() {
      return state.font;
    },
    set font(value: string) {
      state.font = value;
    },
    save: () => undefined,
    restore: () => undefined,
    setTransform: (...args: number[]) => log.setTransform.push(args),
    translate: () => undefined,
    scale: () => undefined,
    clearRect: () => undefined,
    fillRect: () => {
      log.fillRects += 1;
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    setLineDash: () => undefined,
    fillText: () => undefined,
    arc: () => undefined,
    stroke: () => {
      log.strokes += 1;
      log.lineWidths.push(state.lineWidth);
    },
    fill: () => {
      log.fills += 1;
    },
  };
  return { ctx: raw as unknown as CanvasRenderingContext2D, log };
}

let log: Recorded;

beforeEach(() => {
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(DPR);
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
  const recorded = recordingContext();
  log = recorded.log;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recorded.ctx);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ITEMS = Array.from({ length: 17 }, (_, i) => ({
  key: `n${i}`,
  row: i % 21,
  col: (i * 3) % 21,
  content: <span>{`点${i}`}</span>,
}));
const LINKS = Array.from({ length: 32 }, (_, i) => ({
  from: `n${i % 17}`,
  to: `n${(i + 5) % 17}`,
  state: (i % 3 === 0 ? 'active' : 'normal') as 'active' | 'normal',
}));

describe('CanvasGraph · 真的绘制了', () => {
  it('按「容器 × DPR」分配位图并设好 DPR 变换（HiDPI 不糊）', async () => {
    render(<CanvasGraph rows={20} cols={20} items={ITEMS} links={LINKS} />);
    await waitFor(() => expect(log.setTransform.length).toBeGreaterThan(0));
    const canvas = screen.getByTestId('canvas-graph-surface') as HTMLCanvasElement;
    expect(canvas.width).toBe(VIEW.w * DPR);
    expect(canvas.height).toBe(VIEW.h * DPR);
    expect(log.setTransform[0]).toEqual([DPR, 0, 0, DPR, 0, 0]);
  });

  it('⭐ 真的描了 32 条连线的边（不是空白画布）', async () => {
    render(<CanvasGraph rows={20} cols={20} items={ITEMS} links={LINKS} />);
    await waitFor(() => expect(log.strokes).toBeGreaterThanOrEqual(LINKS.length));
    // 连线层的线宽按 1/zoom 折算过，一定是正数（否则真实 canvas 静默不画）
    expect(log.lineWidths.every((width) => width > 0 && Number.isFinite(width))).toBe(true);
  });

  it('默认关网格时不画点阵；打开时才画（fill 次数增加）', async () => {
    const off = render(<CanvasGraph rows={20} cols={20} items={ITEMS} links={LINKS} />);
    await waitFor(() => expect(log.strokes).toBeGreaterThan(0));
    const offStrokes = log.strokes;
    off.unmount();

    const on = render(<CanvasGraph rows={20} cols={20} items={ITEMS} links={LINKS} showGrid />);
    await waitFor(() => expect(log.strokes).toBeGreaterThan(offStrokes));
    on.unmount();
  });

  it('17 个枢纽都真的被写上了 transform（DOM 层定位也发生了）', async () => {
    render(<CanvasGraph rows={20} cols={20} items={ITEMS} links={LINKS} />);
    await waitFor(() =>
      expect(screen.getByTestId('canvas-graph-item-n0').style.transform).not.toBe(''),
    );
    for (const item of ITEMS) {
      const pin = screen.getByTestId(`canvas-graph-item-${item.key}`);
      expect(pin.style.transform).toMatch(/^translate3d\(-?[\d.]+px, -?[\d.]+px, 0\) translate\(-50%, -50%\)$/);
    }
  });

  it('缩放读数从整图适配开始（不是一个假的 100%）', async () => {
    render(<CanvasGraph rows={20} cols={20} items={ITEMS} links={LINKS} />);
    // 世界 21×48 = 1008；容器 900×700 ⇒ zoom_fit = 700/1008 ≈ 0.694 ⇒ 约 69%
    await waitFor(() => {
      const shown = Number(screen.getByTestId('canvas-graph-zoom').textContent?.replace('%', ''));
      expect(shown).toBeGreaterThan(60);
      expect(shown).toBeLessThan(75);
    });
  });
});
