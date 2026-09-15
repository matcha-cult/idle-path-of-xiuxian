/**
 * `paintMarkDot` 单测 —— 功能点（主峰 + 8 功能峰共用）：**实心**、`save/restore` 成对；
 * 半径 ≤ 0 / 非数（尺寸还没量出来）时什么都不画，不留下半个像素的脏点。
 *
 * 注意口径已经搬到数据里了（`radiusCells`）：本层只认像素半径，
 * 所以这里断言的就是"给的半径原样用上"。
 */
import { describe, expect, it } from 'vitest';
import { paintMarkDot } from './paint-mark-dot.js';
import type { MarkDotInput } from './paint-mark-dot.js';
import type { GridPaintContext2D } from './paint-grid.js';

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const raw = {
    fillStyle: '',
    globalAlpha: 1,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    arc: (x: number, y: number, r: number, a0: number, a1: number) =>
      calls.push(`arc(${x},${y},${r},${a0.toFixed(3)},${a1.toFixed(3)})`),
    fill: () => calls.push(`fill@${raw.fillStyle}|${raw.globalAlpha}`),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls };
}

function input(over: Partial<MarkDotInput> = {}): MarkDotInput {
  return { x: 236, y: 236, radius: 5, color: 'mark', ...over };
}

describe('paintMarkDot', () => {
  it('在给定位置画实心圆（整圈：0 → 2π）', () => {
    const { ctx, calls } = recorder();
    paintMarkDot(ctx, input());
    expect(calls).toContain('arc(236,236,5,0.000,6.283)');
    expect(calls).toContain('fill@mark|1');
  });

  it('位置与半径原样使用（口径"直径 = 1 格"由调用方换算成像素半径）', () => {
    const { ctx, calls } = recorder();
    paintMarkDot(ctx, input({ x: 46, y: 26, radius: 12 }));
    expect(calls).toContain('arc(46,26,12,0.000,6.283)');
  });

  it('save/restore 成对（不污染调用方上下文状态）', () => {
    const { ctx, calls } = recorder();
    paintMarkDot(ctx, input());
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });

  it('半径 ≤ 0 / 非数 ⇒ 什么都不画（尺寸未量出时不留下脏点）', () => {
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { ctx, calls } = recorder();
      paintMarkDot(ctx, input({ radius }));
      expect(calls).toEqual([]);
    }
  });

  it('圆心非数 ⇒ 什么都不画（NaN 会让 arc 静默不画，等于故障无声）', () => {
    for (const bad of [{ x: Number.NaN }, { y: Number.NaN }, { y: Number.POSITIVE_INFINITY }]) {
      const { ctx, calls } = recorder();
      paintMarkDot(ctx, input(bad));
      expect(calls).toEqual([]);
    }
  });
});
