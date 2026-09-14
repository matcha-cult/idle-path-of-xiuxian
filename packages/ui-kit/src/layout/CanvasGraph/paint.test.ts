/**
 * `paint` 单测 —— 用一个**记录调用的假 2D 上下文**断言绘制行为。
 *
 * 这正是全 canvas 路线被列出的「测试要 mock canvas」代价（`19-...md` §10 第 3 条）：
 * 因为 `PaintContext2D` 是从 `CanvasRenderingContext2D` 里 `Pick` 出来的**最小结构**，
 * 所以不需要装原生 `canvas` 包、也不需要 jsdom 支持 `getContext`，一个普通对象就够了。
 */
import { describe, expect, it } from 'vitest';
import { paintScene, resolveSegments } from './paint.js';
import type { PaintContext2D, SceneSegment } from './paint.js';
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

interface Recorder {
  ctx: PaintContext2D;
  calls: string[];
  strokes: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const strokes: string[] = [];
  const raw = {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clearRect(${x},${y},${w},${h})`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`fillRect(${x},${y},${w},${h})@${raw.fillStyle}`),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    scale: (x: number, y: number) => calls.push(`scale(${x},${y})`),
    setTransform: () => calls.push('setTransform'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    stroke: () => {
      calls.push('stroke');
      strokes.push(`${raw.strokeStyle}|${raw.lineWidth}|${raw.globalAlpha}`);
    },
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    fill: () => calls.push('fill'),
    fillText: (text: string, x: number, y: number) => calls.push(`fillText(${text},${x},${y})@${raw.globalAlpha}`),
    setLineDash: (segments: number[]) => calls.push(`setLineDash(${segments.join(',')})`),
  };
  return { ctx: raw as unknown as PaintContext2D, calls, strokes };
}

const scene = (over: Partial<Parameters<typeof paintScene>[1]> = {}): Parameters<typeof paintScene>[1] => ({
  rows: 2,
  cols: 2,
  cellPx: 48,
  zoom: 1,
  panX: 0,
  panY: 0,
  viewW: 200,
  viewH: 200,
  showGrid: false,
  segments: [],
  style: paletteFromToken(TOKEN),
  ...over,
});

describe('基底绘制', () => {
  it('先清屏再铺底色，且 save/restore 成对（不污染外部上下文状态）', () => {
    const { ctx, calls } = recorder();
    paintScene(ctx, scene());
    expect(calls[0]).toBe('save');
    expect(calls[1]).toBe('clearRect(0,0,200,200)');
    expect(calls[2]).toBe('fillRect(0,0,200,200)@bg');
    expect(calls.at(-1)).toBe('restore');
  });

  it('世界层用 translate(pan) + scale(zoom) 进入世界坐标（屏幕空间绘制）', () => {
    const { ctx, calls } = recorder();
    paintScene(ctx, scene({ panX: 12, panY: 34, zoom: 1.5 }));
    expect(calls).toContain('translate(12,34)');
    expect(calls).toContain('scale(1.5,1.5)');
  });
});

describe('连线', () => {
  const segments: SceneSegment[] = [
    { x1: 0, y1: 0, x2: 48, y2: 0 },
    { x1: 48, y1: 0, x2: 96, y2: 48, state: 'active' },
    { x1: 0, y1: 0, x2: 0, y2: 96, state: 'locked' },
  ];

  it('线宽按 1/zoom 折算 → 屏幕上始终是同样的粗细（放大不会变成大粗线）', () => {
    const { ctx, strokes } = recorder();
    paintScene(ctx, scene({ segments, zoom: 2 }));
    // normal 线 1.5/2 = 0.75；active 2.5/2 = 1.25；locked 1.5/2 = 0.75
    expect(strokes[0]).toBe('text-3|0.75|0.45');
    expect(strokes[1]).toBe('primary|1.25|0.9');
    expect(strokes[2]).toBe('text-4|0.75|0.35');
  });

  it('画完线把 globalAlpha 复位（否则后面的轴标会被上一根线的透明度带偏）', () => {
    const { ctx, calls, strokes } = recorder();
    paintScene(ctx, scene({ segments, showGrid: true }));
    // 网格 2 次描边（网格线 + 外框）在连线之前；之后依次是 3 根线
    expect(strokes).toHaveLength(2 + segments.length);
    expect(strokes[2]).toBe('text-3|1.5|0.45');
    const labels = calls.filter((call) => call.startsWith('fillText'));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((call) => call.endsWith('@1'))).toBe(true);
  });

  it('无连线时不产生任何 stroke（空图不空转）', () => {
    const { ctx, strokes } = recorder();
    paintScene(ctx, scene({ segments: [] }));
    expect(strokes).toHaveLength(0);
  });
});

describe('开发者点阵（showGrid）', () => {
  it('默认关：不画网格、不画轴标', () => {
    const { ctx, calls } = recorder();
    paintScene(ctx, scene({ showGrid: false }));
    expect(calls.some((call) => call.startsWith('fillText'))).toBe(false);
    expect(calls.some((call) => call.startsWith('arc'))).toBe(false);
  });

  it('打开：画网格线 + 交叉点阵 + 世界外框 + 轴标', () => {
    const { ctx, calls } = recorder();
    paintScene(ctx, scene({ showGrid: true, rows: 2, cols: 2 }));
    // 3 条竖线 + 3 条横线 = 6 段
    expect(calls.filter((call) => call.startsWith('moveTo')).length).toBeGreaterThanOrEqual(6);
    expect(calls.filter((call) => call.startsWith('arc')).length).toBe(9); // 3×3 交叉点
    expect(calls.some((call) => call === 'setLineDash()')).toBe(true);
  });

  it('轴标在 restore **之后**以屏幕空间绘制（字号不随 zoom 变）', () => {
    const { ctx, calls } = recorder();
    paintScene(ctx, scene({ showGrid: true, zoom: 2, panX: 0 }));
    const restoreAt = calls.indexOf('restore');
    const firstLabel = calls.findIndex((call) => call.startsWith('fillText'));
    expect(firstLabel).toBeGreaterThan(restoreAt);
    // 第 1 条轴标（i=0）：x = 0*48*2 + 0 + 2 = 2
    expect(calls[firstLabel]).toBe('fillText(0,2,12)@1');
  });

  it('轴标越出视口时不绘制（不喂给浏览器看不见的文字）', () => {
    const { ctx, calls } = recorder();
    paintScene(ctx, scene({ showGrid: true, viewW: 30, viewH: 30, zoom: 10 }));
    const labels = calls.filter((call) => call.startsWith('fillText'));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(20);
  });
});

describe('resolveSegments（世界坐标派生）', () => {
  const items = [
    { key: 'a', row: 0, col: 0 },
    { key: 'b', row: 1, col: 2 },
  ];

  it('由交叉线索引 × cellPx 算出世界坐标，并透传状态', () => {
    const segments = resolveSegments(items, [{ from: 'a', to: 'b', state: 'active' }], 48);
    expect(segments).toEqual([{ x1: 0, y1: 0, x2: 96, y2: 48, state: 'active' }]);
  });

  it('端点缺一即丢弃（悬挂边不画到 (0,0)）', () => {
    expect(resolveSegments(items, [{ from: 'a', to: 'missing' }], 48)).toEqual([]);
    expect(resolveSegments(items, [{ from: 'missing', to: 'b' }], 48)).toEqual([]);
  });

  it('空输入 → 空输出', () => {
    expect(resolveSegments([], [], 48)).toEqual([]);
    expect(resolveSegments(items, [], 48)).toEqual([]);
  });
});
