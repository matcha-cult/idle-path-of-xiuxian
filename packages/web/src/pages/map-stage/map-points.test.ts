/**
 * `map-points` 单测 —— 点位是"地图的数据"，错了会在浏览器里以"看起来歪了一点"的方式表现。
 * 因此这里逐点核对坐标，并且专门守住两条**结构性**性质：
 *
 * 1. 8 等分：相邻夹角恒为 45°、半径恒为 9（不是"目测差不多"）；
 * 2. 斜向峰的**格点坐标是小数** —— 这正是它们不能被存成整数格点的原因（老地图的歪斜根因）。
 *
 * 另外加一条数据完整性守卫：每个点引用的环都必须存在（打字错误在测试期就炸，而不是运行期静默掉到原点）。
 */
import { describe, expect, it } from 'vitest';
import {
  MAP_CELLS,
  MAP_POINTS,
  MAP_RINGS,
  MARK_RADIUS_CELLS,
  PEAK_COUNT,
  PEAK_PHASE_DEG,
  resolveMapPoints,
  ringRadiusCells,
  toGridMarks,
  toGridRings,
} from './map-points.js';
import type { MapPoint, MapRing } from './map-points.js';

const RESOLVED = resolveMapPoints();
const find = (key: string) => RESOLVED.find((p) => p.key === key);

describe('环定义（半径只写一处）', () => {
  it('主峰环半径 0、功能峰环半径 9 格', () => {
    expect(ringRadiusCells('summit')).toBe(0);
    expect(ringRadiusCells('peak')).toBe(9);
  });

  it('未知环 ⇒ null（运行期不抛错，由单测兜底）', () => {
    expect(ringRadiusCells('nope')).toBeNull();
  });

  it('⭐ 每个点引用的环都存在（改名/打字错误立刻炸）', () => {
    for (const point of MAP_POINTS) {
      expect(ringRadiusCells(point.ring)).not.toBeNull();
    }
  });

  it('点位数量 = 1 主峰 + 8 功能峰', () => {
    expect(MAP_POINTS).toHaveLength(1 + PEAK_COUNT);
    expect(MAP_POINTS.filter((p) => p.kind === 'summit')).toHaveLength(1);
    expect(MAP_POINTS.filter((p) => p.kind === 'peak')).toHaveLength(PEAK_COUNT);
  });
});

describe('8 等分（结构性性质，不看"差不多"）', () => {
  it('⭐ 相邻夹角恒为 45°，且每颗峰都在 9 格半径上', () => {
    const peaks = RESOLVED.filter((p) => p.kind === 'peak');
    expect(peaks).toHaveLength(8);
    for (const peak of peaks) {
      expect(peak.radiusCells).toBe(9);
      expect(Math.hypot(peak.world.x, peak.world.y)).toBeCloseTo(9, 6);
    }
    const angles = peaks.map((p) => p.angleDeg ?? Number.NaN);
    for (let i = 0; i < angles.length; i += 1) {
      const gap = (((angles[(i + 1) % angles.length] ?? 0) - (angles[i] ?? 0)) % 360 + 360) % 360;
      expect(gap).toBeCloseTo(360 / PEAK_COUNT, 9);
    }
  });

  it('相位 0 ⇒ 有一颗正对正北（后天八卦的八个方位）', () => {
    expect(PEAK_PHASE_DEG).toBe(0);
    const north = find('peak_3'); // 0°东 → 45°东北 → 90°北
    expect(north?.angleDeg).toBe(90);
    expect(north?.label).toBe('功能峰·北');
  });

  it('方位标签按角度递增，八向齐全', () => {
    const labels = RESOLVED.filter((p) => p.kind === 'peak').map((p) => p.label);
    expect(labels).toEqual([
      '功能峰·东',
      '功能峰·东北',
      '功能峰·北',
      '功能峰·西北',
      '功能峰·西',
      '功能峰·西南',
      '功能峰·南',
      '功能峰·东南',
    ]);
  });
});

describe('派生坐标（逐点核对）', () => {
  it('主峰在世界原点，格点 = (21,21)', () => {
    const summit = find('summit');
    expect(summit?.world).toEqual({ x: 0, y: 0 });
    expect(summit?.lattice).toEqual({ col: 21, row: 21 });
  });

  it('正东峰 (9,0) ⇒ 格点 (30,21)；正北峰 (0,9) ⇒ 格点 (21,12)', () => {
    expect(find('peak_1')?.world).toEqual({ x: 9, y: 0 });
    expect(find('peak_1')?.lattice).toEqual({ col: 30, row: 21 });
    expect(find('peak_3')?.world).toEqual({ x: 0, y: 9 });
    expect(find('peak_3')?.lattice).toEqual({ col: 21, row: 12 });
  });

  it('正西 / 正南是负坐标（世界口径以中心为原点，所以中心两侧对称）', () => {
    expect(find('peak_5')?.world).toEqual({ x: -9, y: 0 });
    expect(find('peak_7')?.world).toEqual({ x: 0, y: -9 });
  });

  it('⭐ 斜向峰的格点坐标是**小数**（27.364 / 14.636）—— 格索引根本存不下它', () => {
    const ne = find('peak_2');
    expect(ne?.world.x).toBeCloseTo(6.363961031, 9);
    expect(ne?.lattice.col).toBeCloseTo(27.363961031, 6);
    expect(ne?.lattice.row).toBeCloseTo(14.636038969, 6);
    expect(Number.isInteger(ne?.lattice.col)).toBe(false);
  });

  it('四个正方向的格点是整数、四个斜向不是（两类点各 4 个）', () => {
    const peaks = RESOLVED.filter((p) => p.kind === 'peak');
    const integral = peaks.filter((p) => Number.isInteger(p.lattice.col) && Number.isInteger(p.lattice.row));
    expect(integral).toHaveLength(4);
    expect(peaks).toHaveLength(8);
  });

  it('可以换成别的地图尺寸解析（格点口径跟着 MAP_CELLS 走）', () => {
    const onOdd = resolveMapPoints(MAP_POINTS, MAP_RINGS, 43);
    const summit = onOdd.find((p) => p.key === 'summit');
    expect(summit?.lattice).toEqual({ col: 21.5, row: 21.5 });
    expect(MAP_CELLS).toBe(42);
  });

  it('未知环的点退化为原点而不是抛错（防御脏数据）', () => {
    const bad: MapPoint = { key: 'x', kind: 'court', label: 'X', ring: 'nope', angleDeg: 0 };
    const rings: readonly MapRing[] = [{ key: 'peak', radiusCells: 9 }];
    const [resolved] = resolveMapPoints([bad], rings);
    expect(resolved?.radiusCells).toBe(0);
    expect(resolved?.world).toEqual({ x: 0, y: 0 });
  });
});

describe('交给绘制层的最小形状', () => {
  it('半径口径「直径 = 1 格」⇒ 0.5 格（9 个点共用）', () => {
    expect(MARK_RADIUS_CELLS).toBe(0.5);
    for (const mark of toGridMarks(RESOLVED)) {
      expect(mark.radiusCells).toBe(0.5);
    }
  });

  it('marks 的位置就是派生的世界坐标（绘制层不懂业务）', () => {
    const marks = toGridMarks(RESOLVED);
    expect(marks).toHaveLength(9);
    // 顺序：marks[0]=主峰，[1]=东(0°)，[2]=东北(45°)，[3]=北(90°)
    expect(marks[0]?.at).toEqual({ x: 0, y: 0 });
    expect(marks[3]?.at).toEqual({ x: 0, y: 9 });
    expect(marks[5]?.at).toEqual({ x: -9, y: 0 });
  });

  it('rings 只带半径：主峰环半径 0（绘制层会跳过它），功能峰环 9', () => {
    expect(toGridRings()).toEqual([{ radiusCells: 0 }, { radiusCells: 9 }]);
  });
});
