/**
 * `paintCenterCircle` 单测 —— 中心圆是这一轮的交付物，因此把口径与边界都钉死：
 * 圆心/半径由几何层算好（本层只画）、**实心**、`save/restore` 成对；
 * 半径 ≤ 0 / 非数（尺寸还没量出来）时**什么都不画**，不留下半个像素的脏点。
 */
import { describe, expect, it } from 'vitest';
import { paintCenterCircle } from './paint-center-circle.js';
import type { CenterCircleInput } from './paint-center-circle.js';
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

function input(over: Partial<CenterCircleInput> = {}): CenterCircleInput {
  return { cx: 236, cy: 236, radius: 8, color: 'mark', ...over };
}

describe('paintCenterCircle', () => {
  it('⭐ 在给定圆心画实心圆（整圈：0 → 2π）', () => {
    const { ctx, calls } = recorder();
    paintCenterCircle(ctx, input());
    expect(calls).toContain('arc(236,236,8,0.000,6.283)');
    expect(calls).toContain('fill@mark|1');
  });

  it('save/restore 成对（不污染调用方上下文状态）', () => {
    const { ctx, calls } = recorder();
    paintCenterCircle(ctx, input());
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });

  it('半径 ≤ 0 / 非数 ⇒ 什么都不画（尺寸未量出时不留下脏点）', () => {
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { ctx, calls } = recorder();
      paintCenterCircle(ctx, input({ radius }));
      expect(calls).toEqual([]);
    }
  });

  it('圆心非数 ⇒ 什么都不画（NaN 会让 arc 静默不画，等于故障无声）', () => {
    for (const bad of [{ cx: Number.NaN }, { cy: Number.NaN }, { cx: Number.POSITIVE_INFINITY }]) {
      const { ctx, calls } = recorder();
      paintCenterCircle(ctx, input(bad));
      expect(calls).toEqual([]);
    }
  });
});
