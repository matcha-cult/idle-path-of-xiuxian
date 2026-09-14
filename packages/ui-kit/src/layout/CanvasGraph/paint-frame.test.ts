/**
 * `paint-frame` 单测 —— 用假 canvas 断言三件容易写错的事：
 * 1. 位图尺寸 = 容器尺寸 × DPR，且**只在变化时才赋值**（每帧赋值会重置上下文并清空位图）；
 * 2. 拿不到 2D 上下文（jsdom / 极老浏览器）时**不崩**，枢纽照常定位；
 * 3. 枢纽屏幕坐标 = `col/row × cellPx × zoom + pan`（恒定图标尺寸的换算口径）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DPR, paintFrame } from './paint-frame.js';
import type { FrameScene } from './paint-frame.js';
import { paletteFromToken } from './palette.js';
import type { CanvasPaletteSource } from './palette.js';

const TOKEN: CanvasPaletteSource = {
  colorBgContainer: 'bg',
  colorBorderSecondary: 'border-2',
  colorBorder: 'border-1',
  colorTextQuaternary: 'text-4',
  colorTextTertiary: 'text-3',
  colorPrimary: 'primary',
};

/** 假 canvas：能记录 width/height 被赋值的次数。 */
function fakeCanvas(ctx: unknown): {
  canvas: HTMLCanvasElement;
  widthWrites: () => number;
  heightWrites: () => number;
} {
  const box = { w: 1, h: 1 };
  let widthWrites = 0;
  let heightWrites = 0;
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  Object.defineProperty(canvas, 'width', {
    get: () => box.w,
    set: (value: number) => {
      box.w = value;
      widthWrites += 1;
    },
  });
  Object.defineProperty(canvas, 'height', {
    get: () => box.h,
    set: (value: number) => {
      box.h = value;
      heightWrites += 1;
    },
  });
  return { canvas, widthWrites: () => widthWrites, heightWrites: () => heightWrites };
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const raw = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    setTransform: (...args: number[]) => calls.push(`setTransform(${args.join(',')})`),
    clearRect: () => undefined,
    fillRect: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    fillText: () => undefined,
    setLineDash: () => undefined,
  };
  return { ctx: raw as unknown as CanvasRenderingContext2D, calls };
}

const scene = (over: Partial<FrameScene> = {}): FrameScene => ({
  size: { w: 200, h: 200 },
  segments: [],
  style: paletteFromToken(TOKEN),
  showGrid: false,
  rows: 4,
  cols: 4,
  cellPx: 48,
  items: [{ key: 'a', row: 1, col: 2, content: null }],
  ...over,
});

const pose = { zoom: 1, panX: 0, panY: 0 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('位图尺寸', () => {
  it('按容器尺寸 × DPR 出图，并设置 DPR 变换（HiDPI 不糊）', () => {
    const { ctx, calls } = recordingCtx();
    const { canvas } = fakeCanvas(ctx);
    paintFrame(canvas, scene(), pose, () => undefined);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(200);
    expect(calls).toEqual(['setTransform(1,0,0,1,0,0)']);
  });

  it('DPR 被上限夹住（4K 屏上按 3 倍出图会白吃显存）', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(4);
    const { canvas } = fakeCanvas(recordingCtx().ctx);
    paintFrame(canvas, scene(), pose, () => undefined);
    expect(canvas.width).toBe(200 * MAX_DPR);
  });

  it('**只在尺寸变化时赋值**：同尺寸的第二帧不碰 width/height（否则每帧清空位图）', () => {
    const { canvas, widthWrites, heightWrites } = fakeCanvas(recordingCtx().ctx);
    paintFrame(canvas, scene(), pose, () => undefined);
    expect(widthWrites()).toBe(1);
    paintFrame(canvas, scene(), pose, () => undefined);
    paintFrame(canvas, scene(), pose, () => undefined);
    expect(widthWrites()).toBe(1);
    expect(heightWrites()).toBe(1);
    // 尺寸变了才重新分配位图
    paintFrame(canvas, scene({ size: { w: 300, h: 200 } }), pose, () => undefined);
    expect(widthWrites()).toBe(2);
  });

  it('尺寸为 0（容器还没测量出来）时位图至少 1×1，不产出非法尺寸', () => {
    const { canvas } = fakeCanvas(recordingCtx().ctx);
    paintFrame(canvas, scene({ size: { w: 0, h: 0 } }), pose, () => undefined);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });
});

describe('退化路径', () => {
  it('canvas 为 null 时不抛错，枢纽仍然定位（宁可少一层底图，也不要整块画布消失）', () => {
    const movePin = vi.fn();
    expect(() => paintFrame(null, scene(), pose, movePin)).not.toThrow();
    expect(movePin).toHaveBeenCalledTimes(1);
  });

  it('拿不到 2D 上下文（jsdom）时不抛错，枢纽仍然定位', () => {
    const { canvas } = fakeCanvas(null);
    const movePin = vi.fn();
    expect(() => paintFrame(canvas, scene(), pose, movePin)).not.toThrow();
    expect(movePin).toHaveBeenCalledTimes(1);
  });
});

describe('枢纽屏幕坐标（恒定图标尺寸）', () => {
  it('位置 = 坐标 × cellPx × zoom + pan；图标自身不随 zoom 缩放', () => {
    const movePin = vi.fn();
    paintFrame(null, scene({ cellPx: 48 }), { zoom: 2, panX: 10, panY: 20 }, movePin);
    // col=2,row=1 → x = 2*48*2+10 = 202, y = 1*48*2+20 = 116
    expect(movePin).toHaveBeenCalledWith('a', 202, 116);
  });

  it('坐标非法（NaN）的枢纽**不**产出位移（NaN 会让枢纽静默飘出屏幕）', () => {
    const movePin = vi.fn();
    const items = [
      { key: 'bad', row: Number.NaN, col: 1, content: null },
      { key: 'good', row: 0, col: 0, content: null },
    ];
    paintFrame(null, scene({ items }), pose, movePin);
    expect(movePin).toHaveBeenCalledTimes(1);
    expect(movePin).toHaveBeenCalledWith('good', 0, 0);
  });

  it('无枢纽时不调用回调（空图不空转）', () => {
    const movePin = vi.fn();
    paintFrame(null, scene({ items: [] }), pose, movePin);
    expect(movePin).not.toHaveBeenCalled();
  });
});
