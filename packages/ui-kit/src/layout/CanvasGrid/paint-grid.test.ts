/**
 * `paintGrid` 单测 —— 用一个**记录调用的假 2D 上下文**断言绘制行为。
 *
 * 这正是纯 canvas 路线被列出的「测试要 mock canvas」代价：因为绘制函数只依赖从
 * `CanvasRenderingContext2D` 里 `Pick` 出来的最小结构，所以一个普通对象就够了
 * ——不必安装原生 `canvas` 包，也不要求 jsdom 支持 `getContext`。
 *
 * 断言的都是**会被人眼看到的性质**：线有几条、主线是否更深、轴标数字对不对、
 * 悬停格是否真的落在算出来的矩形上、空间不足时是不是只铺了底。
 */
import { describe, expect, it } from 'vitest';
import { paintGrid } from './paint-grid.js';
import type { GridPaintContext2D, GridPaintInput } from './paint-grid.js';
import { gridPalette } from './palette.js';
import type { GridLayout } from './geometry.js';

const PALETTE = gridPalette({
  colorBgContainer: 'bg',
  colorBorderSecondary: 'border-2',
  colorBorder: 'border-1',
  colorPrimary: 'primary',
  colorTextTertiary: 'text-3',
});

/**
 * 2×2 格、每格 10px、pad 26（与真实值一致）⇒ 画布 72×72。
 * 竖线 x = 26.5 / 36.5 / 46.5，横线 y 同理；主线 / 轴标步长 5 ⇒ 刻度索引 [0, 2]。
 */
const LAYOUT: GridLayout = { rows: 2, cols: 2, cellPx: 10, pad: 26 };

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
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
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clearRect(${x},${y},${w},${h})`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`fillRect(${x},${y},${w},${h})@${raw.fillStyle}|${raw.globalAlpha}`),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`strokeRect(${x},${y},${w},${h})@${raw.strokeStyle}|${raw.lineWidth}`),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    stroke: () => {
      calls.push('stroke');
      strokes.push(`${raw.strokeStyle}|${raw.lineWidth}|${raw.globalAlpha}`);
    },
    fillText: (text: string, x: number, y: number) => calls.push(`fillText:${text}@${x},${y}`),
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls, strokes };
}

function input(over: Partial<GridPaintInput> = {}): GridPaintInput {
  return { layout: LAYOUT, hover: null, palette: PALETTE, majorStep: 5, fontPx: 10, fontFamily: 'sans', ...over };
}

const countOf = (calls: string[], prefix: string): number => calls.filter((c) => c.startsWith(prefix)).length;

/** 第一次 `stroke` 之后的调用（用于把「细线那一遍」和「主线那一遍」分开数）。 */
const afterFirstStroke = (calls: string[]): string[] => calls.slice(calls.indexOf('stroke') + 1);

describe('基底与结构', () => {
  it('save/restore 成对（不污染调用方上下文状态）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
    expect(countOf(calls, 'save')).toBe(1);
  });

  it('先清屏再铺底色：清屏和底色都必须发生（否则容器里会留上一帧残影）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    expect(calls[1]).toBe('clearRect(0,0,72,72)');
    expect(calls[2]).toBe('fillRect(0,0,72,72)@bg|1');
  });

  it('空间不足（cellPx=0）⇒ 只铺底、返回 false，不画任何线', () => {
    const { ctx, calls, strokes } = recorder();
    const drew = paintGrid(ctx, input({ layout: { ...LAYOUT, cellPx: 0 } }));
    expect(drew).toBe(false);
    expect(strokes).toEqual([]);
    expect(calls).toContain('clearRect(0,0,0,0)');
    expect(calls).toContain('fillRect(0,0,0,0)@bg|1');
  });
});

describe('网格线', () => {
  it('细线一条 path 一次 stroke：2×2 格 ⇒ 细线 6 条 + 主线 4 条，总共只有两次 stroke', () => {
    const { ctx, calls, strokes } = recorder();
    paintGrid(ctx, input());
    expect(countOf(calls, 'moveTo')).toBe(10);
    expect(countOf(calls, 'lineTo')).toBe(10);
    expect(strokes).toHaveLength(2);
  });

  it('主线叠在细线之上，颜色更深、线宽同为 1px', () => {
    const { ctx, strokes } = recorder();
    paintGrid(ctx, input());
    expect(strokes[0]).toBe('border-2|1|1');
    expect(strokes[1]).toBe('border-1|1|1');
  });

  it('主线只画刻度处，且 1px 线走 0.5 偏移（crisp）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    // 刻度 [0, 2] × 两个方向 = 4 条主线
    expect(countOf(afterFirstStroke(calls), 'moveTo')).toBe(4);
    expect(calls).toContain('moveTo(26.5,26.5)');
    expect(calls).toContain('lineTo(26.5,46.5)');
  });

  it('42×42 ⇒ 每轴 43 条细线（86 条线段），与格子数线性相关而不是平方', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ layout: { rows: 42, cols: 42, cellPx: 10, pad: 26 } }));
    expect(countOf(calls, 'moveTo')).toBe(86 + 20); // 86 细线 + 10×2 主线
  });
});

describe('轴标', () => {
  it('列标在上、行标在左，刻度为 0 与末格（末格必须有，否则量不出总范围）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input());
    const texts = calls
      .filter((c) => c.startsWith('fillText:'))
      .map((c) => c.split('@')[0]?.slice('fillText:'.length));
    expect(texts).toEqual(['0', '2', '0', '2']);
    expect(calls).toContain('fillText:0@26.5,19'); // 列标：pad - 7
    expect(calls).toContain('fillText:0@19,26.5'); // 行标：pad - 7
  });

  it('fontPx ≤ 0 ⇒ 不画轴标，但网格照样画（轴标是可选装饰，不是网格的一部分）', () => {
    const { ctx, calls, strokes } = recorder();
    const drew = paintGrid(ctx, input({ fontPx: 0 }));
    expect(drew).toBe(true);
    expect(countOf(calls, 'fillText')).toBe(0);
    expect(strokes).toHaveLength(2);
  });
});

describe('悬停高亮', () => {
  it('受控高亮格：淡填充 + 内缩 1px 的 2px 描边（描边压住格线不外溢）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ hover: { col: 1, row: 1 } }));
    expect(calls).toContain('fillRect(36,36,10,10)@primary|0.16');
    expect(calls).toContain('strokeRect(37,37,8,8)@primary|2');
  });

  it('hoverAlpha 可调，且描边前把不透明度还原（否则描边会跟着变淡）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ hover: { col: 0, row: 0 }, hoverAlpha: 0.4 }));
    expect(calls).toContain('fillRect(26,26,10,10)@primary|0.4');
    expect(calls).toContain('strokeRect(27,27,8,8)@primary|2');
  });

  it('hover = null ⇒ 不高亮（不画悬停框，也不留下高亮痕迹）', () => {
    const { ctx, calls } = recorder();
    paintGrid(ctx, input({ hover: null }));
    expect(countOf(calls, 'strokeRect')).toBe(0);
  });

  it('越界 hover（脏 props）⇒ 忽略而不是抛错 / 画到网格外', () => {
    const { ctx, calls } = recorder();
    const drew = paintGrid(ctx, input({ hover: { col: 99, row: -1 } }));
    expect(drew).toBe(true);
    expect(countOf(calls, 'strokeRect')).toBe(0);
  });
});
