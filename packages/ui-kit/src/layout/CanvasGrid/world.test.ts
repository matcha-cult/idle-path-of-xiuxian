/**
 * `world` 单测 —— 这层是"几何 vs 格索引"的唯一换算处，错了会以"看起来几乎对"的方式表现
 * （上下镜像、斜向点偏一点），所以边界全部钉死：0/90/45 度、负角、NaN、负半径、
 * 小数格点、以及 `worldToLattice` / `latticeToWorld` 的互逆性。
 *
 * 特别覆盖 **y 翻转**：这是全项目唯一带负号的地方。
 */
import { describe, expect, it } from 'vitest';
import {
  latticeToWorld,
  normalizeAngle,
  polarToWorld,
  ringAngles,
  worldToLattice,
  worldToScreen,
} from './world.js';

const CELLS = 42;
const CENTER = { x: 100, y: 100 };

describe('polarToWorld（环上的点只存半径 + 角度）', () => {
  it('0° = 正东、90° = 正北、逆时针为正', () => {
    expect(polarToWorld(9, 0)).toEqual({ x: 9, y: 0 });
    expect(polarToWorld(9, 90)).toEqual({ x: 0, y: 9 });
    expect(polarToWorld(9, 180)).toEqual({ x: -9, y: 0 });
    expect(polarToWorld(9, 270)).toEqual({ x: 0, y: -9 });
    expect(polarToWorld(9, -90)).toEqual({ x: 0, y: -9 });
  });

  it('⭐ 浮点清理：90° 的 x 必须是 0，而不是 cos 出来的 6.1e-17', () => {
    expect(polarToWorld(9, 90).x).toBe(0);
    expect(polarToWorld(9, 270).x).toBe(0);
    // 也不能留下 -0（它会以 "-0.00" 的形式上屏）
    expect(Object.is(polarToWorld(9, 270).x, -0)).toBe(false);
  });

  it('45° 是 9/√2（无理数 ⇒ 只保留到 1e-9）', () => {
    const ne = polarToWorld(9, 45);
    expect(ne.x).toBeCloseTo(6.363961031, 9);
    expect(ne.y).toBeCloseTo(6.363961031, 9);
  });

  it('半径 0 ⇒ 原点（主峰就是环上的一个点，半径 0）', () => {
    expect(polarToWorld(0, 123)).toEqual({ x: 0, y: 0 });
  });

  it('非法输入 ⇒ 原点（宁可堆在中心，也不让 NaN 进画布）', () => {
    expect(polarToWorld(Number.NaN, 0)).toEqual({ x: 0, y: 0 });
    expect(polarToWorld(9, Number.NaN)).toEqual({ x: 0, y: 0 });
    expect(polarToWorld(9, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
    expect(polarToWorld(-9, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('normalizeAngle / ringAngles', () => {
  it('归一化到 [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(Number.NaN)).toBe(0);
  });

  it('⭐ 8 等分、相位 0 ⇒ 0/45/…/315（有一个点正对正北 90°）', () => {
    expect(ringAngles(8)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('相位可调：22.5 ⇒ 整环转半格，四正方向空出来（给"四门"留位）', () => {
    expect(ringAngles(8, 22.5)).toEqual([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]);
  });

  it('其他等分数：3 等分、4 等分', () => {
    expect(ringAngles(4)).toEqual([0, 90, 180, 270]);
    expect(ringAngles(3).map((a) => Math.round(a))).toEqual([0, 120, 240]);
  });

  it('0 / 负数 / 非数个数 ⇒ 空数组（不猜、不造点）', () => {
    expect(ringAngles(0)).toEqual([]);
    expect(ringAngles(-8)).toEqual([]);
    expect(ringAngles(Number.NaN)).toEqual([]);
  });
});

describe('worldToScreen（全项目唯一的 y 翻转）', () => {
  it('y 向上 ⇒ 屏幕 y 变小（正北在世界 y=+9，屏幕在中心之上）', () => {
    expect(worldToScreen({ x: 0, y: 9 }, CENTER, 10)).toEqual({ x: 100, y: 10 });
    expect(worldToScreen({ x: 9, y: 0 }, CENTER, 10)).toEqual({ x: 190, y: 100 });
    expect(worldToScreen({ x: 0, y: -9 }, CENTER, 10)).toEqual({ x: 100, y: 190 });
    expect(worldToScreen({ x: -9, y: 0 }, CENTER, 10)).toEqual({ x: 10, y: 100 });
  });

  it('世界原点就落在画布中心', () => {
    expect(worldToScreen({ x: 0, y: 0 }, CENTER, 10)).toEqual(CENTER);
  });

  it('cellPx 缩放的是"每格多少像素"，原点不受影响', () => {
    expect(worldToScreen({ x: 1, y: 1 }, CENTER, 24)).toEqual({ x: 124, y: 76 });
  });
});

describe('worldToLattice / latticeToWorld（与数据库口径的桥）', () => {
  it('正北峰 (0,9) ⇒ 列 21 / 行 12；正东峰 (9,0) ⇒ 列 30 / 行 21', () => {
    expect(worldToLattice({ x: 0, y: 9 }, CELLS, CELLS)).toEqual({ col: 21, row: 12 });
    expect(worldToLattice({ x: 9, y: 0 }, CELLS, CELLS)).toEqual({ col: 30, row: 21 });
  });

  it('⭐ 斜向峰落在**小数格点**上：格索引存不下它（这正是不能存格点的理由）', () => {
    const ne = worldToLattice({ x: 6.363961031, y: 6.363961031 }, CELLS, CELLS);
    expect(ne.col).toBeCloseTo(27.363961031, 6);
    expect(ne.row).toBeCloseTo(14.636038969, 6);
    expect(Number.isInteger(ne.col)).toBe(false);
  });

  it('世界中心 = 格点 (21,21)；格点 (21,21) = 世界原点', () => {
    expect(worldToLattice({ x: 0, y: 0 }, CELLS, CELLS)).toEqual({ col: 21, row: 21 });
    expect(latticeToWorld({ col: 21, row: 21 }, CELLS, CELLS)).toEqual({ x: 0, y: 0 });
  });

  it('两者严格互逆（含小数格点）', () => {
    for (const lattice of [
      { col: 0, row: 0 },
      { col: 42, row: 42 },
      { col: 27.363961031, row: 14.636038969 },
    ]) {
      const back = worldToLattice(latticeToWorld(lattice, CELLS, CELLS), CELLS, CELLS);
      expect(back.col).toBeCloseTo(lattice.col, 9);
      expect(back.row).toBeCloseTo(lattice.row, 9);
    }
  });
});
