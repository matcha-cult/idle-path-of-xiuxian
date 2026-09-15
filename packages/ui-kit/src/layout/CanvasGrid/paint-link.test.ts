/**
 * `paintLink` 单测 —— 连接线是数量最多的层（当前 32 条），所以边界必须清楚：
 * 非数不画（NaN 会让整条 path 静默失效）、两端重合不画（那是一个点，别在这里留脏点）、
 * 且**显式清掉虚线**（不然会继承上一层的虚线状态，出现"为什么边是虚线"的排查）。
 */
import { describe, expect, it } from 'vitest';
import { paintLink } from './paint-link.js';
import type { LinkPaintInput } from './paint-link.js';
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
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    stroke: () => {
      calls.push('stroke');
      strokes.push(`${raw.strokeStyle}|${raw.lineWidth}|${raw.globalAlpha}`);
    },
    setLineDash: (segments: number[]) => calls.push(`dash(${segments.join(',')})`),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls, strokes };
}

function input(over: Partial<LinkPaintInput> = {}): LinkPaintInput {
  return { x1: 10, y1: 20, x2: 30, y2: 40, color: 'link', ...over };
}

describe('paintLink', () => {
  it('从起点画到终点（一条直线，默认 1.5px）', () => {
    const { ctx, calls, strokes } = recorder();
    paintLink(ctx, input());
    expect(calls).toEqual([
      'save',
      'dash()', // 显式清虚线
      'beginPath',
      'moveTo(10,20)',
      'lineTo(30,40)',
      'stroke',
      'restore',
    ]);
    expect(strokes).toEqual(['link|1.5|1']);
  });

  it('⭐ 显式 `setLineDash([])`：不继承上一层的虚线（否则边会变成虚线）', () => {
    const { ctx, calls } = recorder();
    paintLink(ctx, input());
    expect(calls).toContain('dash()');
  });

  it('线宽可调', () => {
    const { ctx, strokes } = recorder();
    paintLink(ctx, input({ widthPx: 2.5 }));
    expect(strokes).toEqual(['link|2.5|1']);
  });

  it('save/restore 成对（不污染调用方上下文状态）', () => {
    const { ctx, calls } = recorder();
    paintLink(ctx, input());
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });

  it('非数坐标 ⇒ 什么都不画（NaN 会让整条 path 静默失效，故障无声）', () => {
    for (const bad of [
      { x1: Number.NaN },
      { y1: Number.POSITIVE_INFINITY },
      { x2: Number.NaN },
      { y2: Number.NaN },
    ]) {
      const { ctx, calls } = recorder();
      paintLink(ctx, input(bad));
      expect(calls).toEqual([]);
    }
  });

  it('两端重合 ⇒ 不画（那是一个点，由功能点那层负责）', () => {
    const { ctx, calls } = recorder();
    paintLink(ctx, input({ x2: 10, y2: 20 }));
    expect(calls).toEqual([]);
  });
});
