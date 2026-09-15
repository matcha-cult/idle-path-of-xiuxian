/**
 * `paintGrid` 单测 —— 钉住三件人眼能看见的事：
 *
 * 1. **线宽恒定**：`scale` 从 0.5 到 8，网格线始终是 1 CSS px（这是"放大后特别粗"的回归闸门）；
 * 2. **位置仍然跟着位姿**：`offset + 内容坐标 × scale`，并且逐条对齐设备像素（1px 不虚）；
 * 3. **缩得越小画得越少**：细线间距过小就整层不画（只留主线），轴标过密也不画。
 *
 * 用记录调用的假 2D 上下文断言：本层只依赖从 `CanvasRenderingContext2D` 里 `Pick` 出来的
 * 最小结构，所以普通对象就够（不必装原生 `canvas` 包，也不要求 jsdom 支持 `getContext`）。
 */
import { describe, expect, it } from 'vitest';
import { MIN_MINOR_SPACING_PX, paintGrid } from './paint-grid.js';
import type { GridPaintContext2D, GridPaintInput } from './paint-grid.js';
import { gridPalette } from './palette.js';
import { FIT_POSE } from './pose.js';
import type { Pose } from './pose.js';
import type { GridLayout } from './geometry.js';

const PALETTE = gridPalette({
  colorBgContainer: 'bg',
  colorBorderSecondary: 'border-2',
  colorBorder: 'border-1',
  colorPrimary: 'primary',
  colorTextTertiary: 'text-3',
  colorWarning: 'mark',
});

/** 2×2 格、每格 10px、pad 26 ⇒ 内容 72×72；整图适配时竖线 x = 26.5 / 36.5 / 46.5。 */
const LAYOUT: GridLayout = { rows: 2, cols: 2, cellPx: 10, pad: 26 };
const VIEW = 200;

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
  /** 每次 stroke 的 `颜色|线宽|不透明度` */
  strokes: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const strokes: string[] = [];
  const raw = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    setTransform: (a: number) => calls.push(`setTransform(${a})`),
    clearRect: () => calls.push('clearRect'),
    fillRect: () => calls.push('fillRect'),
    strokeRect: () => calls.push('strokeRect'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    stroke: () => {
      calls.push('stroke');
      strokes.push(`${raw.strokeStyle}|${raw.lineWidth}|${raw.globalAlpha}`);
    },
    fill: () => calls.push('fill'),
    arc: () => calls.push('arc'),
    setLineDash: () => calls.push('dash'),
    fillText: (text: string, x: number, y: number) => calls.push(`fillText:${text}@${x},${y}@${raw.font}`),
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls, strokes };
}

function input(over: Partial<GridPaintInput> = {}): GridPaintInput {
  return {
    layout: LAYOUT,
    palette: PALETTE,
    pose: FIT_POSE,
    viewW: VIEW,
    viewH: VIEW,
    dpr: 1,
    majorStep: 5,
    fontPx: 10,
    fontFamily: 'sans',
    ...over,
  };
}

const countOf = (calls: string[], prefix: string): number => calls.filter((c) => c.startsWith(prefix)).length;

/** 把网格中心摆在视口中心的位姿：放大到 8× 后网格仍覆盖视口（否则会被"视口外剔除"清空）。 */
function centered(scale: number, cellPx: number): Pose {
  return {
    scale,
    offsetX: VIEW / 2 - (LAYOUT.pad + (cellPx * LAYOUT.cols) / 2) * scale,
    offsetY: VIEW / 2 - (LAYOUT.pad + (cellPx * LAYOUT.rows) / 2) * scale,
  };
}

/** 第一次 `stroke` 之后的调用（把"细线那一遍"与"主线那一遍"分开数）。 */
const afterFirstStroke = (calls: string[]): string[] => calls.slice(calls.indexOf('stroke') + 1);

/** 某一遍里所有 `moveTo` 的坐标对。 */
function pointsOf(calls: string[], prefix = 'moveTo'): { x: number; y: number }[] {
  return calls
    .filter((call) => call.startsWith(prefix))
    .map((call) => {
      const matched = /^[a-zA-Z]+\((-?[\d.]+),(-?[\d.]+)\)$/.exec(call);
      return { x: Number(matched?.[1]), y: Number(matched?.[2]) };
    });
}

describe('职责与上下文', () => {
  it('几何不可用（cellPx=0）⇒ false，且一条线都不画', () => {
    const { ctx, calls, strokes } = recorder();
    const drew = paintGrid(ctx, input({ layout: { ...LAYOUT, cellPx: 0 } }));
    expect(drew).toBe(false);
    expect(strokes).toEqual([]);
    expect(countOf(calls, 'moveTo')).toBe(0);
  });

  it('清屏与底色**不**在本层（paintScene 在屏幕空间统一铺满视口）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    expect(countOf(calls, 'clearRect')).toBe(0);
    expect(countOf(calls, 'fillRect')).toBe(0);
  });

  it('自己把变换摆成屏幕空间，且 save/restore 成对（不污染调用方状态）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ dpr: 2 }));
    expect(calls[0]).toBe('setTransform(2)');
    expect(calls[1]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
    expect(countOf(calls, 'save')).toBe(1);
    expect(calls).toContain('dash'); // 显式清掉虚线：不依赖别人的 restore 好习惯
  });

  it('只画底图：不画圆、不画悬停框、不填充路径（那些层由 paintScene 按层序调用）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    expect(countOf(calls, 'arc')).toBe(0);
    expect(countOf(calls, 'strokeRect')).toBe(0);
    expect(calls).not.toContain('fill');
  });
});

describe('线宽恒定（本轮的靶心）', () => {
  it('⭐ scale 从 0.5 到 8，细线与主线都是 1px（不乘 scale）', () => {
    for (const scale of [0.5, 0.75, 1, 1.7, 3, 8]) {
      const { ctx, strokes } = recorder();
      // 每格 20px：0.5× 时间距仍有 10px，不会被"细线自适应"那一层提前砍掉；再居中免得被剔除
      paintGrid(ctx, input({ layout: { ...LAYOUT, cellPx: 20 }, pose: centered(scale, 20) }));
      expect(strokes).toHaveLength(2);
      expect(strokes[0]).toBe('border-2|1|1');
      expect(strokes[1]).toBe('border-1|1|1');
    }
  });

  it('⭐ 字号也不随缩放变（轴标是读数，不是地图内容）', () => {
    for (const scale of [1, 2.5, 8]) {
      const { ctx, calls } = recorder();
      paintGrid(ctx, input({ pose: { scale, offsetX: 0, offsetY: 0 }, viewW: 2000, viewH: 2000 }));
      const texts = calls.filter((c) => c.startsWith('fillText:'));
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) expect(text.endsWith('@10px sans')).toBe(true);
    }
  });
});

describe('位置跟着位姿 + 逐条对齐设备像素', () => {
  it('整图适配（scale=1、offset=0、dpr=1）⇒ 与搬迁前完全一致：26.5 / 36.5 / 46.5', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    expect(calls).toContain('moveTo(26.5,26.5)');
    expect(calls).toContain('lineTo(26.5,46.5)');
    expect(countOf(calls, 'moveTo')).toBe(3 + 3 + 2 + 2); // 细线 3+3、主线 2+2（刻度 0/2 两向）
    expect(countOf(calls, 'lineTo')).toBe(10);
  });

  it('平移 + 放大：屏幕坐标 = offset + 内容坐标 × scale', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ pose: { scale: 2, offsetX: 10, offsetY: 20 } }));
    // 内容 26/36/46 ⇒ 屏幕 62/82/102（dpr=1 时再对齐到 .5）
    // 上边界：20 + 26×2 = 72 ⇒ 72.5；竖线 x：10 + 内容 × 2
    expect(pointsOf(calls, 'moveTo').slice(0, 3)).toEqual([
      { x: 62.5, y: 72.5 },
      { x: 82.5, y: 72.5 },
      { x: 102.5, y: 72.5 },
    ]);
  });

  it('⭐ 非整数缩放（scale=1.7）：线仍落在半像素上（内容空间 crisp 在这里失效）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ pose: { scale: 1.7, offsetX: 0, offsetY: 0 } }));
    expect(calls).toContain('moveTo(44.5,44.5)'); // 26 × 1.7 = 44.2 ⇒ 44.5
    for (const point of pointsOf(calls, 'moveTo')) {
      expect(Math.abs(point.x - Math.round(point.x))).toBeCloseTo(0.5, 9);
    }
  });

  it('⭐ dpr=2：落点全是**整数**（2 个设备像素宽 ⇒ 整数边界才清晰）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ pose: { scale: 1.3, offsetX: 3.2, offsetY: 0 }, dpr: 2 }));
    const xs = pointsOf(calls, 'moveTo').map((point) => point.x * 2);
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-9);
  });
});

describe('自适应与剔除（缩得越小画得越少）', () => {
  it('⭐ 细线间距小于下限 ⇒ 细线整层不画，只留主线', () => {
    const tiny = { ...LAYOUT, cellPx: 5 }; // 间距 5 < MIN_MINOR_SPACING_PX
    expect(MIN_MINOR_SPACING_PX).toBeGreaterThan(5);
    const { ctx, calls, strokes } = recorder();
    paintGrid(ctx, input({ layout: tiny }));
    expect(strokes).toHaveLength(1); // 只剩主线那一遍
    expect(strokes[0]).toBe('border-1|1|1');
    expect(calls).toContain('moveTo(26.5,26.5)'); // 主线还在（刻度 0）
  });

  it('细线间距刚好够 ⇒ 两层都画（阈值不是"全部不画"）', () => {
    const { ctx, strokes } = recorder();
    paintGrid(ctx, input({ layout: { ...LAYOUT, cellPx: MIN_MINOR_SPACING_PX } }));
    expect(strokes).toHaveLength(2);
  });

  it('42×42 ⇒ 每轴 43 条细线（86 条线段）+ 主线 10 条，与格子数线性相关', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ layout: { rows: 42, cols: 42, cellPx: 10, pad: 26 }, viewW: 600, viewH: 600 }));
    expect(countOf(calls, 'moveTo')).toBe(86 + 20);
  });

  it('视口外的线不画（放大后 42 条里通常只有几条可见）', () => {
    const { ctx, calls } = recorder();
    // scale=8、offset=-200、视口 100 ⇒ 竖线屏幕 x = 8 / 88 / 168，最后一条出界
    paintGrid(ctx, input({ pose: { scale: 8, offsetX: -200, offsetY: -200 }, viewW: 100, viewH: 100 }));
    const moved = pointsOf(calls, 'moveTo');
    expect(moved).toHaveLength(6); // 细线 2+2、主线 1+1（末刻度 168.5 出界）
    expect(moved.filter((point) => point.x === 88.5)).toHaveLength(1); // 中间那条竖线还在
    expect(moved.map((point) => point.x)).not.toContain(168.5); // 出界那条不画
  });

  it('整个网格都在视口外 ⇒ 一条线都不画（不空转）', () => {
    const { ctx, calls, strokes } = recorder();
    paintGrid(ctx, input({ pose: { scale: 8, offsetX: 0, offsetY: 0 }, viewW: 100, viewH: 100 }));
    expect(strokes).toEqual([]);
    expect(countOf(calls, 'moveTo')).toBe(0);
  });
});

describe('轴标', () => {
  it('列标在网格上边界外、行标在左边界外；刻度为 0 与末格', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    const texts = calls
      .filter((c) => c.startsWith('fillText:'))
      .map((c) => c.slice('fillText:'.length).split('@')[0]);
    expect(texts).toEqual(['0', '2', '0', '2']);
    expect(calls).toContain('fillText:0@26.5,19.5@10px sans'); // 列标：边界 26.5 − 7
    expect(calls).toContain('fillText:0@19.5,26.5@10px sans'); // 行标：边界 26.5 − 7
  });

  it('fontPx ≤ 0 ⇒ 不画轴标，网格照画（轴标是可选装饰）', () => {
    const { ctx, calls, strokes } = recorder();
    expect(paintGrid(ctx, input({ fontPx: 0 }))).toBe(true);
    expect(countOf(calls, 'fillText')).toBe(0);
    expect(strokes).toHaveLength(2);
  });

  it('主线间距过密 ⇒ 轴标不画（数字叠在一起比没有更糟）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ layout: { ...LAYOUT, cellPx: 1 } })); // 主线间距 5 < 18
    expect(countOf(calls, 'fillText')).toBe(0);
  });

  it('网格边界出了视口 ⇒ 轴标不画（不让数字飘在空白处）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ pose: { scale: 4, offsetX: -200, offsetY: -200 }, viewW: 100, viewH: 100 }));
    expect(countOf(calls, 'fillText')).toBe(0);
  });

  it('轴标位置跟着位姿走（缩放后数字落在新的刻度上）', () => {
    const pose: Pose = { scale: 2, offsetX: 10, offsetY: 20 };
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ pose }));
    // 上边界：20 + 26×2 = 72 ⇒ 72.5；列标在它上面 7px ⇒ 65.5
    expect(calls).toContain('fillText:0@62.5,65.5@10px sans');
  });
});
