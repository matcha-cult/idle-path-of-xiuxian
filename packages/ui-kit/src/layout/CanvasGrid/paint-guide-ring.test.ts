/**
 * `paintGuideRing` 单测 —— 轨道环是"结构层"：半径由**格**换算而来（本层只收像素），
 * 四种颜色分工中的一种，且"半径 0 的环"（主峰）必须什么都不画。
 */
import { describe, expect, it } from 'vitest';
import { paintGuideRing } from './paint-guide-ring.js';
import type { GridPaintContext2D } from './paint-grid.js';

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
  strokes: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const strokes: string[] = [];
  const raw = {
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    arc: (x: number, y: number, r: number, a0: number, a1: number) =>
      calls.push(`arc(${x},${y},${r},${a0.toFixed(3)},${a1.toFixed(3)})`),
    stroke: () => {
      calls.push('stroke');
      strokes.push(`${raw.strokeStyle}|${raw.lineWidth}|${raw.globalAlpha}`);
    },
    setLineDash: (segments: number[]) => calls.push(`dash(${segments.join(',')})`),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls, strokes };
}

const BASE = { cx: 236, cy: 236, radius: 90, color: 'guide' };

describe('paintGuideRing', () => {
  it('整圈描边（0 → 2π），默认线宽 1.5、实线', () => {
    const { ctx, calls, strokes } = recorder();
    paintGuideRing(ctx, BASE);
    expect(calls).toContain('arc(236,236,90,0.000,6.283)');
    expect(strokes).toEqual(['guide|1.5|1']);
    expect(calls).toContain('dash()');
  });

  it('线宽与虚线可调（虚线是"参考轨道"的视觉语言）', () => {
    const { ctx, calls, strokes } = recorder();
    paintGuideRing(ctx, { ...BASE, widthPx: 2, dashed: true });
    expect(strokes).toEqual(['guide|2|1']);
    expect(calls).toContain('dash(4,4)');
  });

  it('save/restore 成对（虚线设置不会漏到后面的层）', () => {
    const { ctx, calls } = recorder();
    paintGuideRing(ctx, { ...BASE, dashed: true });
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });

  it('⭐ 半径 ≤ 0 ⇒ 什么都不画（主峰那种"半径 0 的环"不该画成一坨）', () => {
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { ctx, calls } = recorder();
      paintGuideRing(ctx, { ...BASE, radius });
      expect(calls).toEqual([]);
    }
  });

  it('圆心非数 ⇒ 什么都不画', () => {
    const { ctx, calls } = recorder();
    paintGuideRing(ctx, { ...BASE, cx: Number.NaN });
    expect(calls).toEqual([]);
  });
});
