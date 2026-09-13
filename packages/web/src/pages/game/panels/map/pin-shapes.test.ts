/**
 * `pin-shapes` 纯函数的边界：环层档位映射（含 `approach` / 未知值兜底）、
 * 多边形与星形顶点数、四档直径单调性。
 */
import { describe, expect, it } from 'vitest';
import {
  RING_SHAPE,
  RING_TIERS,
  RING_VISUAL_PX,
  polygonPoints,
  starPoints,
  tierOfRing,
} from './pin-shapes.js';

/** 顶点串 → 坐标对数（每对 `x,y`）。 */
function vertexCount(points: string): number {
  return points.trim().split(/\s+/).length;
}

describe('pin-shapes · tierOfRing（环层 → 形状档）', () => {
  it('四档原样通过', () => {
    for (const tier of RING_TIERS) expect(tierOfRing(tier)).toBe(tier);
  });

  it('`approach`（外门接引）归入山门档', () => {
    expect(tierOfRing('approach')).toBe('outer');
  });

  it('未知 / 空 / 大小写不符 → 兜底「峰」档（不新增第 5 种形状）', () => {
    for (const weird of ['', 'OUTER', 'Peaks', 'gate', '主峰']) {
      expect(tierOfRing(weird)).toBe('peaks');
    }
  });
});

describe('pin-shapes · 四档形状与直径', () => {
  it('形状表覆盖四档且互不相同', () => {
    const shapes = RING_TIERS.map((tier) => RING_SHAPE[tier]);
    expect(shapes).toEqual(['square', 'circle', 'hexagon', 'star']);
    expect(new Set(shapes).size).toBe(4);
  });

  it('主峰最大；其余三档都在合理区间（≤ 主峰、> 0）', () => {
    const values = RING_TIERS.map((tier) => RING_VISUAL_PX[tier]);
    expect(RING_VISUAL_PX.summit).toBe(Math.max(...values));
    for (const value of values) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(RING_VISUAL_PX.summit);
    }
    expect(RING_VISUAL_PX.outer).toBeLessThan(RING_VISUAL_PX.summit);
  });
});

describe('pin-shapes · 顶点计算', () => {
  it('六边形：6 个顶点，第一点朝正上方', () => {
    const points = polygonPoints(50, 50, 10, 6);
    expect(vertexCount(points)).toBe(6);
    expect(points.split(' ')[0]).toBe('50.0,40.0');
  });

  it('正 n 边形：n 个顶点；非法 n（<3 或小数）收敛到 ≥3 的整数', () => {
    expect(vertexCount(polygonPoints(0, 0, 5, 4))).toBe(4);
    expect(vertexCount(polygonPoints(0, 0, 5, 2))).toBe(3);
    expect(vertexCount(polygonPoints(0, 0, 5, 4.9))).toBe(4);
  });

  it('八角星：16 个顶点（8 外 8 内），外顶点到圆心距离 > 内顶点', () => {
    const points = starPoints(0, 0, 10, 4, 8);
    const pairs = points.split(' ').map((pair) => pair.split(',').map(Number));
    expect(pairs).toHaveLength(16);
    const radius = (pair: number[]): number => Math.hypot(pair[0] as number, pair[1] as number);
    expect(radius(pairs[0] as number[])).toBeCloseTo(10, 1);
    expect(radius(pairs[1] as number[])).toBeCloseTo(4, 1);
  });

  it('非法半径（0 / 负数）不产出 NaN', () => {
    expect(polygonPoints(0, 0, -3, 6)).not.toContain('NaN');
    expect(starPoints(0, 0, 0, -1, 8)).not.toContain('NaN');
  });
});
