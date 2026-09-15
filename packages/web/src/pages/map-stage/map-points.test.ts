/**
 * `map-points` 单测 —— 点位是"地图的数据"，错了会在浏览器里以"看起来歪了一点"的方式表现。
 * 因此这里逐点核对坐标，并且专门守住三条**结构性**性质：
 *
 * 1. 8 等分：相邻夹角恒为 45°、半径恒为 9（不是"目测差不多"）；
 * 2. 四门在四个**正方向**、八峰**错开 22.5°**（相位口径，一眼能看出的正确性）；
 * 3. 环上的点的**格点坐标是小数** —— 这正是它们不能被存成整数格点的原因（老地图的歪斜根因）。
 *
 * 另外加一条数据完整性守卫：每个点引用的环都必须存在（打字错误在测试期就炸，而不是运行期静默掉到原点）。
 */
import { describe, expect, it } from 'vitest';
import {
  GATE_COUNT,
  GATE_RING_CELLS,
  MAP_CELLS,
  MAP_POINTS,
  MAP_RINGS,
  MARK_RADIUS_CELLS,
  PEAK_COUNT,
  PEAK_PHASE_DEG,
  PEAK_RING_CELLS,
  RING_RADIUS_LIMITS,
  adjustableRings,
  clampRadius,
  defaultRingRadii,
  resolveMapPoints,
  ringRadiusCells,
  toGridMarks,
  toGridRings,
  withRingRadii,
} from './map-points.js';
import type { MapPoint, MapRing } from './map-points.js';

const RESOLVED = resolveMapPoints();
const find = (key: string) => RESOLVED.find((p) => p.key === key);
const peaks = RESOLVED.filter((p) => p.kind === 'peak');
const gates = RESOLVED.filter((p) => p.kind === 'gate');

/** 两个角度之间的最小夹角（0..180）。 */
function angularGap(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

describe('环定义（半径只写一处）', () => {
  it('主峰环 0 格、功能峰环 9 格、宗门门环 10 格（虚线）', () => {
    expect(ringRadiusCells('summit')).toBe(0);
    expect(ringRadiusCells('peak')).toBe(PEAK_RING_CELLS);
    expect(ringRadiusCells('gate')).toBe(GATE_RING_CELLS);
    expect(MAP_RINGS.find((r) => r.key === 'gate')?.dashed).toBe(true);
  });

  it('未知环 ⇒ null（运行期不抛错，由单测兜底）', () => {
    expect(ringRadiusCells('nope')).toBeNull();
  });

  it('⭐ 每个点引用的环都存在（改名/打字错误立刻炸）', () => {
    for (const point of MAP_POINTS) {
      expect(ringRadiusCells(point.ring)).not.toBeNull();
    }
  });

  it('点位数量 = 1 主峰 + 8 功能峰 + 4 宗门门', () => {
    expect(MAP_POINTS).toHaveLength(1 + PEAK_COUNT + GATE_COUNT);
    expect(peaks).toHaveLength(PEAK_COUNT);
    expect(gates).toHaveLength(GATE_COUNT);
  });
});

describe('8 等分（结构性性质，不看"差不多"）', () => {
  it('⭐ 相邻夹角恒为 45°，且每颗峰都在 9 格半径上', () => {
    for (const peak of peaks) {
      expect(peak.radiusCells).toBe(PEAK_RING_CELLS);
      expect(Math.hypot(peak.world.x, peak.world.y)).toBeCloseTo(PEAK_RING_CELLS, 6);
    }
    const angles = peaks.map((p) => p.angleDeg ?? Number.NaN);
    for (let i = 0; i < angles.length; i += 1) {
      const gap = (((angles[(i + 1) % angles.length] ?? 0) - (angles[i] ?? 0)) % 360 + 360) % 360;
      expect(gap).toBeCloseTo(360 / PEAK_COUNT, 9);
    }
  });

  it('相位 22.5° ⇒ 峰正好落在两个具名方位之间（所以只能按序号命名）', () => {
    expect(PEAK_PHASE_DEG).toBe(22.5);
    expect(peaks[0]?.angleDeg).toBe(22.5);
    expect(peaks[2]?.angleDeg).toBe(112.5);
    // 没有任何一颗峰落在 0/45/90… 这些方位角上
    for (const peak of peaks) {
      expect((peak.angleDeg ?? 0) % 45).not.toBe(0);
    }
  });

  it('名字按序号（真名以后由数据表给，key 不变）', () => {
    expect(peaks.map((p) => p.label)).toEqual([
      '八峰·一',
      '八峰·二',
      '八峰·三',
      '八峰·四',
      '八峰·五',
      '八峰·六',
      '八峰·七',
      '八峰·八',
    ]);
    expect(peaks.map((p) => p.key)).toEqual([
      'peak_1',
      'peak_2',
      'peak_3',
      'peak_4',
      'peak_5',
      'peak_6',
      'peak_7',
      'peak_8',
    ]);
  });
});

describe('四门（四个正方向）与「错开 22.5°」', () => {
  it('四门在 0/90/180/270（东/北/西/南），半径 10 格', () => {
    expect(gates.map((g) => g.angleDeg)).toEqual([0, 90, 180, 270]);
    expect(gates.map((g) => g.label)).toEqual(['宗门·东门', '宗门·北门', '宗门·西门', '宗门·南门']);
    for (const gate of gates) {
      expect(gate.radiusCells).toBe(GATE_RING_CELLS);
    }
  });

  it('四门的坐标就是四个正方向（整数）', () => {
    expect(find('gate_1')?.world).toEqual({ x: 10, y: 0 });
    expect(find('gate_2')?.world).toEqual({ x: 0, y: 10 });
    expect(find('gate_3')?.world).toEqual({ x: -10, y: 0 });
    expect(find('gate_4')?.world).toEqual({ x: 0, y: -10 });
    expect(find('gate_1')?.lattice).toEqual({ col: 31, row: 21 });
    expect(find('gate_2')?.lattice).toEqual({ col: 21, row: 11 });
  });

  it('⭐ 门与峰错开 22.5°：每颗峰到最近的门，角距恰好 22.5°', () => {
    const gateAngles = gates.map((g) => g.angleDeg ?? Number.NaN);
    for (const peak of peaks) {
      const nearest = Math.min(...gateAngles.map((angle) => angularGap(peak.angleDeg ?? 0, angle)));
      expect(nearest).toBeCloseTo(22.5, 9);
    }
  });

  it('门环比峰环靠外 1 格（10 > 9），两条轨道不会重叠', () => {
    expect(GATE_RING_CELLS).toBeGreaterThan(PEAK_RING_CELLS);
  });
});

describe('派生坐标（逐点核对）', () => {
  it('主峰在世界原点，格点 = (21,21)', () => {
    const summit = find('summit');
    expect(summit?.world).toEqual({ x: 0, y: 0 });
    expect(summit?.lattice).toEqual({ col: 21, row: 21 });
  });

  it('第一颗峰 22.5°：世界 (8.315, 3.444)（= 9·cos/sin 22.5°）', () => {
    expect(find('peak_1')?.world.x).toBeCloseTo(8.314915793, 9);
    expect(find('peak_1')?.world.y).toBeCloseTo(3.444150891, 9);
  });

  it('8 个峰两两关于主峰中心对称（8 等分 + 单一相位的必然结果）', () => {
    const [p1, , p3] = peaks;
    expect(p1?.world.x).toBeCloseTo(-(peaks[4]?.world.x ?? 0), 9);
    expect(p1?.world.y).toBeCloseTo(-(peaks[4]?.world.y ?? 0), 9);
    expect(p3?.world.x).toBeCloseTo(-(peaks[6]?.world.x ?? 0), 9);
    expect(p3?.world.y).toBeCloseTo(-(peaks[6]?.world.y ?? 0), 9);
  });

  it('⭐ 相位 22.5° 后，8 个峰的格点坐标**全都是小数**（格索引更存不下）', () => {
    for (const peak of peaks) {
      expect(Number.isInteger(peak.lattice.col)).toBe(false);
      expect(Number.isInteger(peak.lattice.row)).toBe(false);
    }
    expect(find('peak_1')?.lattice.col).toBeCloseTo(29.314915793, 6);
    expect(find('peak_1')?.lattice.row).toBeCloseTo(17.555849109, 6);
  });

  it('四门反而落在整数格点上 —— 两类点口径不同，正好说明为什么要分开建模', () => {
    expect(Number.isInteger(find('gate_1')?.lattice.col)).toBe(true);
    expect(Number.isInteger(find('gate_2')?.lattice.row)).toBe(true);
  });

  it('可以换成别的地图尺寸解析（格点口径跟着 MAP_CELLS 走）', () => {
    const onOdd = resolveMapPoints(MAP_POINTS, MAP_RINGS, 43);
    const summit = onOdd.find((p) => p.key === 'summit');
    expect(summit?.lattice).toEqual({ col: 21.5, row: 21.5 });
    expect(MAP_CELLS).toBe(42);
  });

  it('未知环的点退化为原点而不是抛错（防御脏数据）', () => {
    const bad: MapPoint = { key: 'x', kind: 'court', label: 'X', ring: 'nope', angleDeg: 0 };
    const rings: readonly MapRing[] = [{ key: 'peak', label: '二环 · 八峰', radiusCells: 9 }];
    const [resolved] = resolveMapPoints([bad], rings);
    expect(resolved?.radiusCells).toBe(0);
    expect(resolved?.world).toEqual({ x: 0, y: 0 });
  });
});

describe('交给绘制层的最小形状', () => {
  it('半径口径「直径 = 1 格」⇒ 0.5 格（所有点位共用）', () => {
    expect(MARK_RADIUS_CELLS).toBe(0.5);
    for (const mark of toGridMarks(RESOLVED)) {
      expect(mark.radiusCells).toBe(0.5);
    }
  });

  it('marks 的位置就是派生的世界坐标（绘制层不懂业务）', () => {
    const marks = toGridMarks(RESOLVED);
    expect(marks).toHaveLength(1 + PEAK_COUNT + GATE_COUNT);
    // 顺序：marks[0]=主峰，[1..8]=八峰，[9..12]=四门
    expect(marks[0]?.at).toEqual({ x: 0, y: 0 });
    expect(marks[9]?.at).toEqual({ x: 10, y: 0 });
    expect(marks[10]?.at).toEqual({ x: 0, y: 10 });
  });

  it('rings 带半径 + 线型：外环 r10 虚线、二环 r9 实线、中心 r0（绘制层跳过）', () => {
    expect(toGridRings()).toEqual([
      { radiusCells: GATE_RING_CELLS, dashed: true },
      { radiusCells: PEAK_RING_CELLS, dashed: false },
      { radiusCells: 0, dashed: false },
    ]);
  });
});

describe('滑杆：环半径可调（会话态，不动数据表）', () => {
  it('环表从外到内排列，且带用户口径的显示名（外环/二环/中心）', () => {
    expect(MAP_RINGS.map((ring) => ring.key)).toEqual(['gate', 'peak', 'summit']);
    expect(MAP_RINGS.map((ring) => ring.label)).toEqual(['外环 · 四门', '二环 · 八峰', '中心 · 主峰']);
  });

  it('只有可调的环给滑杆：中心（主峰）被排除', () => {
    expect(adjustableRings().map((ring) => ring.key)).toEqual(['gate', 'peak']);
  });

  it('默认半径表 = 数据表里的值（刷新回到这里）', () => {
    expect(defaultRingRadii()).toEqual({ gate: 10, peak: 9, summit: 0 });
  });

  it('⭐ 覆盖生效且**不改原表**（纯函数，滑杆调多久数据表都不动）', () => {
    const overridden = withRingRadii({ peak: 12.5 });
    expect(overridden.find((ring) => ring.key === 'peak')?.radiusCells).toBe(12.5);
    expect(overridden.find((ring) => ring.key === 'gate')?.radiusCells).toBe(10);
    expect(MAP_RINGS.find((ring) => ring.key === 'peak')?.radiusCells).toBe(9); // 原表没被改
    expect(overridden).not.toBe(MAP_RINGS);
  });

  it('⭐ 中心（fixed）忽略覆盖 —— 主峰不该被拖走', () => {
    const overridden = withRingRadii({ summit: 8 });
    expect(overridden.find((ring) => ring.key === 'summit')?.radiusCells).toBe(0);
  });

  it('未知 key / 非数 ⇒ 该环保持默认（不猜、不拖到 0）', () => {
    expect(withRingRadii({ nope: 5 }).map((r) => r.radiusCells)).toEqual([10, 9, 0]);
    expect(withRingRadii({ peak: Number.NaN }).map((r) => r.radiusCells)).toEqual([10, 9, 0]);
    expect(withRingRadii({ peak: Number.POSITIVE_INFINITY }).map((r) => r.radiusCells)).toEqual([10, 9, 0]);
  });

  it('半径夹在滑杆范围内（0 … 半幅）：越界值不会画出网格外的环', () => {
    expect(RING_RADIUS_LIMITS).toEqual({ min: 0, max: 21, step: 0.5 });
    expect(clampRadius(999)).toBe(21);
    expect(clampRadius(-5)).toBe(0);
    expect(clampRadius(Number.NaN)).toBe(0);
    expect(withRingRadii({ peak: 999 }).find((r) => r.key === 'peak')?.radiusCells).toBe(21);
    expect(withRingRadii({ gate: -3 }).find((r) => r.key === 'gate')?.radiusCells).toBe(0);
  });

  it('⭐ 覆盖后重算点位：半径变了，点的世界坐标跟着变（这就是"调半径"的整条链）', () => {
    const [gate, peak] = withRingRadii({ peak: 10, gate: 14 });
    const resolved = resolveMapPoints(MAP_POINTS, withRingRadii({ peak: 10, gate: 14 }));
    const eastGate = resolved.find((point) => point.key === 'gate_1');
    const firstPeak = resolved.find((point) => point.key === 'peak_1');
    expect(gate?.radiusCells).toBe(14);
    expect(peak?.radiusCells).toBe(10);
    // 东门被拖到 r=14 ⇒ (14, 0)
    expect(eastGate?.world).toEqual({ x: 14, y: 0 });
    // 八峰·一 被拖到 r=10、仍在 22.5° ⇒ (9.239, 3.827)
    expect(firstPeak?.world.x).toBeCloseTo(9.238795325, 9);
    expect(firstPeak?.world.y).toBeCloseTo(3.826834324, 9);
  });

  it('滑杆给 4 位小数也不会有浮点渣（半径本身就是半格步长）', () => {
    const overridden = withRingRadii({ peak: 9.5 });
    const resolved = resolveMapPoints(MAP_POINTS, overridden);
    expect(resolved.find((point) => point.key === 'peak_1')?.world.x).toBeCloseTo(8.777, 3);
  });
});
