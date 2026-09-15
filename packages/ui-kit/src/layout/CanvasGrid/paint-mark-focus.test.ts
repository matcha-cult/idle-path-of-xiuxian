/**
 * `paintMarkFocus` 单测 —— 聚焦圈是"点被悬停/选中"的唯一视觉证据，所以口径要钉死：
 * 圈画在**点外面**（不改点的大小）、间隙为负时按 0 处理（否则圈压住点、看着像点变大了）、
 * **实线**（虚线是上下文状态，会跨层残留）、以及非法输入不画。
 */
import { describe, expect, it } from 'vitest';
import { paintMarkFocus } from './paint-mark-focus.js';
import type { MarkFocusInput } from './paint-mark-focus.js';
import type { GridPaintContext2D } from './paint-grid.js';

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const raw = {
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    stroke: () => calls.push(`stroke@${raw.strokeStyle}|${raw.lineWidth}`),
    setLineDash: (segments: number[]) => calls.push(`dash(${segments.join(',')})`),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls };
}

function input(over: Partial<MarkFocusInput> = {}): MarkFocusInput {
  return { x: 100, y: 100, dotRadius: 5, color: 'focus', ...over };
}

describe('paintMarkFocus', () => {
  it('圈画在点外面：半径 = 点半径 + 间隙 + 半个线宽', () => {
    const { ctx, calls } = recorder();
    paintMarkFocus(ctx, input()); // 5 + 3 + 0.75 = 8.75
    expect(calls).toContain('arc(100,100,8.75)');
    expect(calls).toContain('stroke@focus|1.5');
  });

  it('线宽可调（选中的圈更粗），半径跟着线宽补偿', () => {
    const { ctx, calls } = recorder();
    paintMarkFocus(ctx, input({ widthPx: 2 })); // 5 + 3 + 1 = 9
    expect(calls).toContain('arc(100,100,9)');
    expect(calls).toContain('stroke@focus|2');
  });

  it('⭐ 间隙负数按 0 处理（否则圈会压住点，看起来像"点变大了"）', () => {
    const { ctx, calls } = recorder();
    paintMarkFocus(ctx, input({ gapPx: -5 })); // 5 + 0 + 0.75
    expect(calls).toContain('arc(100,100,5.75)');
  });

  it('⭐ 显式清虚线：聚焦圈必须是实线（虚线会跨层残留）', () => {
    const { ctx, calls } = recorder();
    paintMarkFocus(ctx, input());
    expect(calls).toContain('dash()');
  });

  it('save/restore 成对', () => {
    const { ctx, calls } = recorder();
    paintMarkFocus(ctx, input());
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });

  it('圆心或半径非数 ⇒ 什么都不画', () => {
    for (const bad of [{ x: Number.NaN }, { y: Number.NaN }, { dotRadius: Number.NaN }]) {
      const { ctx, calls } = recorder();
      paintMarkFocus(ctx, input(bad));
      expect(calls).toEqual([]);
    }
  });
});
