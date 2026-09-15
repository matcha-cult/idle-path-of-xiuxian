/**
 * `paintHoverCell` 单测 —— 交互反馈层：填充定"哪一格"、描边定"边界在哪"，
 * 且描边不能跟着填充一起变淡；越界格（脏 props）必须被忽略而不是抛错。
 */
import { describe, expect, it } from 'vitest';
import { paintHoverCell } from './paint-hover-cell.js';
import type { GridPaintContext2D } from './paint-grid.js';
import type { GridLayout } from './geometry.js';

/** 2×2 格、每格 10px、pad 26 ⇒ 格 (1,1) 的矩形是 (36,36,10,10)。 */
const LAYOUT: GridLayout = { rows: 2, cols: 2, cellPx: 10, pad: 26 };

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const raw = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`fillRect(${x},${y},${w},${h})@${raw.fillStyle}|${raw.globalAlpha}`),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`strokeRect(${x},${y},${w},${h})@${raw.strokeStyle}|${raw.lineWidth}`),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls };
}

describe('paintHoverCell', () => {
  it('淡填充 + 内缩 1px 的 2px 描边（描边压住格线不外溢）', () => {
    const { ctx, calls } = recorder();
    paintHoverCell(ctx, { cell: { col: 1, row: 1 }, layout: LAYOUT, color: 'primary' });
    expect(calls).toContain('fillRect(36,36,10,10)@primary|0.16');
    expect(calls).toContain('strokeRect(37,37,8,8)@primary|2');
  });

  it('alpha 可调，且描边前把不透明度还原（否则边界会跟着变淡）', () => {
    const { ctx, calls } = recorder();
    paintHoverCell(ctx, { cell: { col: 0, row: 0 }, layout: LAYOUT, color: 'primary', alpha: 0.4 });
    expect(calls).toContain('fillRect(26,26,10,10)@primary|0.4');
    expect(calls).toContain('strokeRect(27,27,8,8)@primary|2');
  });

  it('save/restore 成对（不污染调用方上下文状态）', () => {
    const { ctx, calls } = recorder();
    paintHoverCell(ctx, { cell: { col: 0, row: 0 }, layout: LAYOUT, color: 'primary' });
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });

  it('越界格 / 不可用几何 ⇒ 什么都不画（脏 props 不该画出界，也不该抛错）', () => {
    for (const [cell, layout] of [
      [{ col: 99, row: 0 }, LAYOUT],
      [{ col: 0, row: -1 }, LAYOUT],
      [{ col: 0, row: 0 }, { ...LAYOUT, cellPx: 0 }],
    ] as const) {
      const { ctx, calls } = recorder();
      paintHoverCell(ctx, { cell, layout, color: 'primary' });
      expect(calls).toEqual([]);
    }
  });
});
