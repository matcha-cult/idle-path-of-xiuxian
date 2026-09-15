/**
 * `hit-test` 单测 —— 命中测试是"点能不能被点到"的唯一依据，所以把边界钉死：
 * **太小的点也要点得着**（命中半径下限）、**最近优先**、**平手取下标小的**（确定性）、
 * **与画出来的位置同源**（同一个 y 翻转）、以及非法输入不抛错。
 */
import { describe, expect, it } from 'vitest';
import {
  CLICK_MOVE_SLOP_PX,
  DEFAULT_MARK_HIT_SLOP_PX,
  hitTestMarks,
  isClickGesture,
  markKeyOf,
} from './hit-test.js';
import type { GridMark } from './types.js';

/** 世界原点落在画布 (100,100)，每格 10px。 */
const CENTER = { x: 100, y: 100 };
const CELL_PX = 10;
/** 直径 1 格的点 ⇒ 半径 5px（小于命中下限 8px，正好用来验证下限生效）。 */
const DOT: GridMark = { at: { x: 0, y: 0 }, radiusCells: 0.5 };

const hit = (x: number, y: number, marks: readonly GridMark[] = [DOT], slopPx?: number): number | null =>
  hitTestMarks({ x, y, marks, center: CENTER, cellPx: CELL_PX, ...(slopPx === undefined ? {} : { slopPx }) });

describe('markKeyOf', () => {
  it('数据给了 key 就用它；没给退回下标（两种都要能工作）', () => {
    expect(markKeyOf({ ...DOT, key: 'peak_1' }, 0)).toBe('peak_1');
    expect(markKeyOf(DOT, 3)).toBe('3');
  });
});

describe('hitTestMarks', () => {
  it('命中圆心', () => {
    expect(hit(100, 100)).toBe(0);
  });

  it('⭐ 太小的点也要点得着：半径 5px 的点，7px 外仍算命中（命中下限兜住手感）', () => {
    expect(DEFAULT_MARK_HIT_SLOP_PX).toBe(8);
    expect(hit(107, 100)).toBe(0);
    expect(hit(100, 107)).toBe(0);
  });

  it('超出命中半径 ⇒ 不命中（不是"永远命中最近的"）', () => {
    expect(hit(109, 100)).toBeNull();
    expect(hit(100, 100 - 9)).toBeNull();
  });

  it('下限可调：调大后更远也能点中，调小后更严格', () => {
    expect(hit(112, 100, [DOT], 15)).toBe(0);
    expect(hit(106, 100, [DOT], 2)).toBeNull();
  });

  it('⭐ 最近优先：两个点都能命中时选更近的那个', () => {
    const marks: GridMark[] = [
      { at: { x: 0, y: 0 }, radiusCells: 0.5 }, // 屏幕 (100,100)
      { at: { x: 1, y: 0 }, radiusCells: 0.5 }, // 屏幕 (110,100)
    ];
    expect(hit(108, 100, marks)).toBe(1);
    expect(hit(102, 100, marks)).toBe(0);
  });

  it('⭐ 完全平手 ⇒ 取下标小的（同样的输入永远命中同一个点，避免"有时点得中有时点不中"）', () => {
    const marks: GridMark[] = [
      { at: { x: 0, y: 0 }, radiusCells: 0.5 },
      { at: { x: 1, y: 0 }, radiusCells: 0.5 },
    ];
    expect(hit(105, 100, marks)).toBe(0); // 到两点都是 5px
  });

  it('⭐ 与画出来的位置同源（同一个 y 翻转）：世界 +y 的点在屏幕**上方**', () => {
    const above: GridMark = { at: { x: 0, y: 1 }, radiusCells: 0.5 }; // 屏幕 (100,90)
    expect(hit(100, 90, [above])).toBe(0);
    expect(hit(100, 100, [above])).toBeNull();
  });

  it('点半径较大时命中半径跟着变大（大点更好点）', () => {
    const big: GridMark = { at: { x: 0, y: 0 }, radiusCells: 2 }; // 半径 20px
    expect(hit(118, 100, [big])).toBe(0);
    expect(hit(122, 100, [big])).toBeNull();
  });

  it('没有点 / 非法输入 ⇒ null，且不抛错', () => {
    expect(hit(100, 100, [])).toBeNull();
    expect(hit(Number.NaN, 100)).toBeNull();
    expect(hit(100, Number.NaN)).toBeNull();
    expect(hitTestMarks({ x: 100, y: 100, marks: [DOT], center: CENTER, cellPx: 0 })).toBeNull();
    expect(hitTestMarks({ x: 100, y: 100, marks: [DOT], center: CENTER, cellPx: Number.NaN })).toBeNull();
  });
});

describe('isClickGesture（把点击从拖动里区分出来）', () => {
  it('没有按下记录 ⇒ 不算点击', () => {
    expect(isClickGesture(null, { x: 10, y: 10 })).toBe(false);
  });

  it('原地按下抬起 ⇒ 是点击', () => {
    expect(isClickGesture({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
  });

  it('小幅抖动（≤ 阈值）仍算点击 —— 手不可能完全不动', () => {
    expect(CLICK_MOVE_SLOP_PX).toBe(4);
    expect(isClickGesture({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(true);
  });

  it('⭐ 位移超过阈值 ⇒ 是拖动，不是点击（以后加拖动时不会顺手选中/取消）', () => {
    expect(isClickGesture({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(false);
    expect(isClickGesture({ x: 10, y: 10 }, { x: 10, y: 15 })).toBe(false);
  });
});
