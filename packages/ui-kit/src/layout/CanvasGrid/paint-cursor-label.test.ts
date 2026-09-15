/**
 * `paintCursorLabel` 单测 —— 标签是「鼠标移到网格就报坐标」这句话的**画布内**那一半，
 * 所以夹边规则必须逐条钉死：右侧放不下翻左、上方放不下翻下、最后一定留在画布内。
 *
 * 文字宽度用 `measureText` 实测（假上下文给「每字符 6px」），因此这里能断言精确的盒宽，
 * 而不是「大概不超边」。
 */
import { describe, expect, it } from 'vitest';
import { paintCursorLabel } from './paint-cursor-label.js';
import type { CursorLabelInput } from './paint-cursor-label.js';
import type { GridPaintContext2D } from './paint-grid.js';

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
}

/**
 * 假上下文：`measureText` 返回「字符数 × 6」，于是 `text = '12,7'`（4 字符）⇒ 宽 24，
 * 盒宽 = 24 + 12 = 36，盒高 = 10 + 10 = 20。所有期望值都由这两个常数推出。
 */
function recorder(): Recorder {
  const calls: string[] = [];
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
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`box(${x},${y},${w},${h})@${raw.fillStyle}`),
    fillText: (text: string, x: number, y: number) => calls.push(`text(${text}@${x},${y})@${raw.fillStyle}`),
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls };
}

function input(over: Partial<CursorLabelInput> = {}): CursorLabelInput {
  return {
    text: '12,7',
    x: 100,
    y: 100,
    width: 400,
    height: 400,
    fontPx: 10,
    fontFamily: 'sans',
    background: 'ink',
    foreground: 'bg',
    ...over,
  };
}

describe('paintCursorLabel', () => {
  it('默认落在光标右下（不盖住光标尖），盒宽由 measureText 实测决定', () => {
    const { ctx, calls } = recorder();
    paintCursorLabel(ctx, input());
    expect(calls).toContain('box(114,73,36,20)@ink');
    expect(calls).toContain('text(12,7@132,83)@bg');
  });

  it('右边放不下 ⇒ 翻到光标左侧（而不是被夹到边上盖住光标）', () => {
    const { ctx, calls } = recorder();
    paintCursorLabel(ctx, input({ x: 380, width: 400 }));
    // 380 + 14 + 36 = 430 > 400 ⇒ bx = 380 - 14 - 36 = 330
    expect(calls).toContain('box(330,73,36,20)@ink');
  });

  it('上方放不下 ⇒ 翻到光标下方', () => {
    const { ctx, calls } = recorder();
    paintCursorLabel(ctx, input({ y: 5 }));
    // by = 5 - 20 - 7 = -22 < 0 ⇒ by = 5 + 21 = 26
    expect(calls).toContain('box(114,26,36,20)@ink');
  });

  it('无论怎么翻都夹在画布内（左边界不为负）', () => {
    const { ctx, calls } = recorder();
    paintCursorLabel(ctx, input({ x: 0, y: 200, width: 20, height: 400 }));
    expect(calls).toContain('box(0,173,36,20)@ink');
  });

  it('save/restore 成对，文字居中于盒内', () => {
    const { ctx, calls } = recorder();
    paintCursorLabel(ctx, input());
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
    // 盒中心 = 114 + 18 = 132、73 + 10 = 83
    expect(calls).toContain('text(12,7@132,83)@bg');
  });

  it('非法入参（NaN 坐标 / 非正画布尺寸）⇒ 什么都不画，也不抛错', () => {
    for (const bad of [
      { x: Number.NaN },
      { y: Number.NaN },
      { width: 0 },
      { height: -1 },
      { width: Number.NaN },
    ]) {
      const { ctx, calls } = recorder();
      paintCursorLabel(ctx, input(bad));
      expect(calls).toEqual([]);
    }
  });
});
