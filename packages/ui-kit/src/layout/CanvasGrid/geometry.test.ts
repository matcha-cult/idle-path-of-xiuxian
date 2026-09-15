/**
 * `geometry` 单测 —— 几何是所有绘制与命中的**唯一真值来源**，因此这里刻意把边界写满：
 * 空值 / NaN / Infinity / 负数 / 0 / 小数 / 恰好落在边界线上 / 空间不足。
 *
 * 上一轮的教训：几何算错不会抛错，只会让画面「看起来怪」——那是最贵的一类问题
 * （要靠人肉在浏览器里盯出来）。所以能在纯函数层钉死的，一条都不留到浏览器里。
 */
import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  canvasSize,
  cellAtPoint,
  cellLabel,
  cellRect,
  crisp,
  fitCellPx,
  gridCenter,
  isCellInside,
  isLayoutUsable,
  lineCount,
  sameCell,
  worldSize,
} from './geometry.js';
import type { GridLayout } from './geometry.js';

/** 2×2 格、每格 10px、pad 5 ⇒ 世界 20×20、画布 30×30。 */
const LAYOUT: GridLayout = { rows: 2, cols: 2, cellPx: 10, pad: 5 };

describe('lineCount / worldSize', () => {
  it('n 个格子 ⇒ n+1 条线（42 格 ⇒ 43 条）', () => {
    expect(lineCount(42)).toBe(43);
    expect(lineCount(1)).toBe(2);
  });

  it('0 / 负数 / 非数 / Infinity ⇒ 0（宁可什么都不画，也不要 NaN 条线）', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(lineCount(bad)).toBe(0);
    }
  });

  it('小数格子数向下取整（半格不成立）', () => {
    expect(lineCount(3.7)).toBe(4);
  });

  it('世界尺寸 = 格子数 × 格宽；任何非法输入 ⇒ 0', () => {
    expect(worldSize(42, 14)).toBe(588);
    expect(worldSize(0, 14)).toBe(0);
    expect(worldSize(42, 0)).toBe(0);
    expect(worldSize(42, Number.NaN)).toBe(0);
    expect(worldSize(Number.NaN, 14)).toBe(0);
  });
});

describe('isLayoutUsable / isCellInside', () => {
  it('可用几何：格子数、格宽为正，pad 非负', () => {
    expect(isLayoutUsable(LAYOUT)).toBe(true);
    expect(isLayoutUsable({ ...LAYOUT, cellPx: 0 })).toBe(false);
    expect(isLayoutUsable({ ...LAYOUT, rows: 0 })).toBe(false);
    expect(isLayoutUsable({ ...LAYOUT, pad: -1 })).toBe(false);
    expect(isLayoutUsable({ ...LAYOUT, pad: Number.NaN })).toBe(false);
  });

  it('格子边界：col === cols 已经越界（最后一格是 cols-1）', () => {
    expect(isCellInside({ col: 0, row: 0 }, LAYOUT)).toBe(true);
    expect(isCellInside({ col: 1, row: 1 }, LAYOUT)).toBe(true);
    expect(isCellInside({ col: 2, row: 0 }, LAYOUT)).toBe(false);
    expect(isCellInside({ col: 0, row: -1 }, LAYOUT)).toBe(false);
    expect(isCellInside({ col: Number.NaN, row: 0 }, LAYOUT)).toBe(false);
  });
});

describe('fitCellPx（整图适配）', () => {
  it('42 格 + pad 26 塞进 500×500 ⇒ 每格 10px（向下取整，不取 10.67 那种半像素）', () => {
    expect(fitCellPx({ availW: 500, availH: 500, rows: 42, cols: 42, pad: 26 })).toBe(10);
  });

  it('取宽高里更小的那一维（扁容器由高度决定）', () => {
    expect(fitCellPx({ availW: 2000, availH: 200, rows: 2, cols: 2, pad: 0 })).toBe(100);
    expect(fitCellPx({ availW: 200, availH: 2000, rows: 2, cols: 2, pad: 0 })).toBe(100);
  });

  it('空间不足（算出来 < minCellPx）⇒ 0，而不是画成 1px 的糊状物', () => {
    expect(fitCellPx({ availW: 100, availH: 100, rows: 42, cols: 42, pad: 26 })).toBe(0);
    expect(fitCellPx({ availW: 100, availH: 100, rows: 10, cols: 10, pad: 0, minCellPx: 11 })).toBe(0);
  });

  it('pad 比容器还大 ⇒ 0（可用空间为负不能变负数格宽）', () => {
    expect(fitCellPx({ availW: 40, availH: 40, rows: 2, cols: 2, pad: 26 })).toBe(0);
  });

  it('非法输入 ⇒ 0（容器还没量出来时是 0×0，这是正常状态而不是异常）', () => {
    expect(fitCellPx({ availW: 0, availH: 0, rows: 42, cols: 42, pad: 26 })).toBe(0);
    expect(fitCellPx({ availW: 500, availH: 500, rows: 0, cols: 42, pad: 26 })).toBe(0);
    expect(fitCellPx({ availW: 500, availH: 500, rows: 42, cols: 42, pad: -1 })).toBe(0);
    expect(fitCellPx({ availW: Number.NaN, availH: 500, rows: 42, cols: 42, pad: 26 })).toBe(0);
  });

  it('恰好整除时取整数值本身（168/42 = 4，刚好等于下限）', () => {
    expect(fitCellPx({ availW: 168, availH: 168, rows: 42, cols: 42, pad: 0 })).toBe(4);
  });

  it('整除结果低于下限 ⇒ 0；显式放宽下限才允许更小的格', () => {
    // 84/42 = 2 < MIN_CELL_PX(4)：宁可说"空间不足"，也不画 2px 的格子
    expect(fitCellPx({ availW: 84, availH: 84, rows: 42, cols: 42, pad: 0 })).toBe(0);
    expect(fitCellPx({ availW: 84, availH: 84, rows: 42, cols: 42, pad: 0, minCellPx: 1 })).toBe(2);
  });
});

describe('canvasSize', () => {
  it('含两侧 pad', () => {
    expect(canvasSize(LAYOUT)).toEqual({ w: 30, h: 30 });
    expect(canvasSize({ rows: 42, cols: 42, cellPx: 10, pad: 26 })).toEqual({ w: 472, h: 472 });
  });

  it('不可用几何 ⇒ 0×0（画布退化为不可见，而不是留一张幽灵白图让人猜）', () => {
    expect(canvasSize({ ...LAYOUT, cellPx: 0 })).toEqual({ w: 0, h: 0 });
  });
});

describe('cellAtPoint', () => {
  it('pad 区域属于「没有格子」：四边都一样，不把边界格撑大', () => {
    expect(cellAtPoint(5, 5, LAYOUT)).toEqual({ col: 0, row: 0 });
    expect(cellAtPoint(4, 4, LAYOUT)).toBeNull();
    expect(cellAtPoint(0, 0, LAYOUT)).toBeNull();
    expect(cellAtPoint(25, 25, LAYOUT)).toBeNull();
    expect(cellAtPoint(29, 29, LAYOUT)).toBeNull();
  });

  it('格内任意点落到同一格；边界线归右侧/下方那一格', () => {
    expect(cellAtPoint(14.9, 14.9, LAYOUT)).toEqual({ col: 0, row: 0 });
    expect(cellAtPoint(15, 15, LAYOUT)).toEqual({ col: 1, row: 1 });
    expect(cellAtPoint(24.9, 24.9, LAYOUT)).toEqual({ col: 1, row: 1 });
  });

  it('行列各自独立判定（宽扁点不会串格）', () => {
    expect(cellAtPoint(15, 5, LAYOUT)).toEqual({ col: 1, row: 0 });
    expect(cellAtPoint(5, 15, LAYOUT)).toEqual({ col: 0, row: 1 });
  });

  it('NaN / Infinity / 不可用几何 ⇒ null', () => {
    expect(cellAtPoint(Number.NaN, 10, LAYOUT)).toBeNull();
    expect(cellAtPoint(10, Number.NaN, LAYOUT)).toBeNull();
    expect(cellAtPoint(Number.POSITIVE_INFINITY, 10, LAYOUT)).toBeNull();
    expect(cellAtPoint(10, 10, { ...LAYOUT, cellPx: 0 })).toBeNull();
  });
});

describe('cellRect', () => {
  it('格子 ⇒ 画布像素矩形（含 pad 偏移）', () => {
    expect(cellRect({ col: 0, row: 0 }, LAYOUT)).toEqual({ x: 5, y: 5, w: 10, h: 10 });
    expect(cellRect({ col: 1, row: 1 }, LAYOUT)).toEqual({ x: 15, y: 15, w: 10, h: 10 });
  });

  it('越界格子 / 不可用几何 ⇒ null（高亮格来自外部 props，必须能容忍脏值）', () => {
    expect(cellRect({ col: 2, row: 0 }, LAYOUT)).toBeNull();
    expect(cellRect({ col: -1, row: 0 }, LAYOUT)).toBeNull();
    expect(cellRect({ col: 0, row: 0 }, { ...LAYOUT, cellPx: 0 })).toBeNull();
  });
});

describe('axisTicks', () => {
  it('42 格 / 每 5 格 ⇒ 0,5,…,40 且补上末格 42', () => {
    expect(axisTicks(42, 5)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 42]);
  });

  it('末格恰好是整数倍时不重复补', () => {
    expect(axisTicks(10, 5)).toEqual([0, 5, 10]);
    expect(axisTicks(42, 42)).toEqual([0, 42]);
  });

  it('step ≤ 0 / 非数 / 超过总格数 ⇒ 只画两端（至少让人知道范围）', () => {
    expect(axisTicks(42, 0)).toEqual([0, 42]);
    expect(axisTicks(42, -3)).toEqual([0, 42]);
    expect(axisTicks(42, Number.NaN)).toEqual([0, 42]);
    expect(axisTicks(42, 100)).toEqual([0, 42]);
  });

  it('0 / 负数 / 非数格子数 ⇒ 空数组（没有网格就没有刻度）', () => {
    expect(axisTicks(0, 5)).toEqual([]);
    expect(axisTicks(-1, 5)).toEqual([]);
    expect(axisTicks(Number.NaN, 5)).toEqual([]);
  });
});

describe('crisp', () => {
  it('1px 线条走整数 + 0.5（否则奇数线宽会跨像素发虚）', () => {
    expect(crisp(5)).toBe(5.5);
    expect(crisp(5.4)).toBe(5.5);
    expect(crisp(5.6)).toBe(6.5);
    expect(crisp(-0.2)).toBe(0.5);
  });
});

describe('gridCenter', () => {
  it('42 格 ⇒ 中心落在第 21 条横线与第 21 条竖线的交点（不是某一格的中心）', () => {
    expect(gridCenter({ rows: 42, cols: 42, cellPx: 10, pad: 26 })).toEqual({ x: 236, y: 236 });
  });

  it('奇数格时中心落在半格上（3 格 ⇒ 1.5 格处），这也是对的', () => {
    expect(gridCenter({ rows: 3, cols: 3, cellPx: 10, pad: 26 })).toEqual({ x: 41, y: 41 });
  });

  it('不可用几何 ⇒ null（不把圆心偷偷退到 (0,0)，那是网格外的角落）', () => {
    expect(gridCenter({ rows: 42, cols: 42, cellPx: 0, pad: 26 })).toBeNull();
    expect(gridCenter({ rows: 0, cols: 42, cellPx: 10, pad: 26 })).toBeNull();
  });
});

describe('sameCell / cellLabel', () => {
  it('同格判定：两个 null 也算「同一状态」（"一直不在格子上"不该重复上报）', () => {
    expect(sameCell(null, null)).toBe(true);
    expect(sameCell({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true);
    expect(sameCell({ col: 1, row: 2 }, { col: 1, row: 3 })).toBe(false);
    expect(sameCell({ col: 1, row: 2 }, null)).toBe(false);
  });

  it('标签文字是 "列,行"（只服务画布内小字号，页面读数另有补零格式）', () => {
    expect(cellLabel({ col: 7, row: 3 })).toBe('7,3');
    expect(cellLabel({ col: 0, row: 41 })).toBe('0,41');
  });
});
