/**
 * `map-points` 单测 —— 点位是"地图的数据"，错了会在浏览器里以"看起来歪了一点"的方式表现。
 * 因此这里逐点核对坐标，并且专门守住三条**结构性**性质：
 *
 * 1. 8 等分：相邻夹角恒为 45°、半径恒为环半径（不是"目测差不多"）；
 * 2. 四门在四个**正方向**、八峰**错开 22.5°**（相位口径，一眼能看出的正确性）；
 * 3. 内环 8 等分里四正 = 四院、四隅 = 预留位，且预留位带 `hidden`（**数据在、不渲染**）；
 * 4. 环上的点的**格点坐标是小数** —— 这正是它们不能被存成整数格点的原因（老地图的歪斜根因）。
 *
 * 另外加一条数据完整性守卫：每个点引用的环都必须存在（打字错误在测试期就炸，而不是运行期静默掉到原点）。
 */
import { describe, expect, it } from 'vitest';
import {
  COURT_COUNT,
  COURT_RING_CELLS,
  COURT_SLOT_COUNT,
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
  hiddenPoints,
  resolveMapPoints,
  ringRadiusCells,
  toGridMarks,
  toGridRings,
  visiblePoints,
  withRingRadii,
} from './map-points.js';
import type { MapPoint, MapRing, ResolvedMapPoint } from './map-points.js';

const RESOLVED = resolveMapPoints();
const find = (key: string) => RESOLVED.find((p) => p.key === key);
const peaks = RESOLVED.filter((p) => p.kind === 'peak');
const gates = RESOLVED.filter((p) => p.kind === 'gate');

/** 两个角度之间的最小夹角（0..180）。 */
function angularGap(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

/**
 * 用**显式夹具**验证「极坐标 → 坐标」这条数学：半径与角度都是**输入**，
 * 所以断言里的字面量（8.315 / 29.315 …）永远有效，不会因为数据表调半径而失效。
 * （数据表当前的半径属于"数据"，不该被几何测试钉死 —— 见文件末尾的派生断言。）
 */
function resolveOne(radiusCells: number, angleDeg: number): ResolvedMapPoint {
  return resolveMapPoints(
    [{ key: 'p', kind: 'peak', label: 'P', ring: 'r', angleDeg }],
    [{ key: 'r', label: 'R', radiusCells }],
  )[0] as ResolvedMapPoint;
}

describe('环定义（半径只写一处）', () => {
  it('主峰环 0 格、内环 5 格、二环 9 格、外环 10 格（外环虚线）', () => {
    expect(ringRadiusCells('summit')).toBe(0);
    expect(ringRadiusCells('court')).toBe(COURT_RING_CELLS);
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

  it('点位数量 = 1 主峰 + 8 八峰 + 4 宗门门 + 内环 8 个位置（其中 4 个隐藏）', () => {
    expect(MAP_POINTS).toHaveLength(1 + PEAK_COUNT + GATE_COUNT + COURT_SLOT_COUNT);
    expect(peaks).toHaveLength(PEAK_COUNT);
    expect(gates).toHaveLength(GATE_COUNT);
    expect(MAP_POINTS.filter((point) => point.ring === 'court')).toHaveLength(COURT_SLOT_COUNT);
    expect(MAP_POINTS.filter((point) => point.hidden === true)).toHaveLength(COURT_SLOT_COUNT - COURT_COUNT);
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

  it('四门的坐标就是四个正方向（整数，半径 = 数据表当前值）', () => {
    expect(find('gate_1')?.world).toEqual({ x: GATE_RING_CELLS, y: 0 });
    expect(find('gate_2')?.world).toEqual({ x: 0, y: GATE_RING_CELLS });
    expect(find('gate_3')?.world).toEqual({ x: -GATE_RING_CELLS, y: 0 });
    expect(find('gate_4')?.world).toEqual({ x: 0, y: -GATE_RING_CELLS });
    expect(find('gate_1')?.lattice).toEqual({ col: 21 + GATE_RING_CELLS, row: 21 });
    expect(find('gate_2')?.lattice).toEqual({ col: 21, row: 21 - GATE_RING_CELLS });
  });

  it('⭐ 门与峰错开 22.5°：每颗峰到最近的门，角距恰好 22.5°', () => {
    const gateAngles = gates.map((g) => g.angleDeg ?? Number.NaN);
    for (const peak of peaks) {
      const nearest = Math.min(...gateAngles.map((angle) => angularGap(peak.angleDeg ?? 0, angle)));
      expect(nearest).toBeCloseTo(22.5, 9);
    }
  });

  it('门环比峰环**靠外**（两条轨道不会重叠）', () => {
    expect(GATE_RING_CELLS).toBeGreaterThan(PEAK_RING_CELLS);
    expect(PEAK_RING_CELLS).toBeGreaterThan(COURT_RING_CELLS);
  });
});

describe('派生坐标（逐点核对）', () => {
  it('主峰在世界原点，格点 = (21,21)', () => {
    const summit = find('summit');
    expect(summit?.world).toEqual({ x: 0, y: 0 });
    expect(summit?.lattice).toEqual({ col: 21, row: 21 });
  });

  it('⭐ 极坐标 → 世界坐标：r=9、22.5° ⇒ (8.315, 3.444) = 9·cos/sin 22.5°（夹具输入，与数据表当前值无关）', () => {
    expect(resolveOne(9, 22.5).world.x).toBeCloseTo(8.314915793, 9);
    expect(resolveOne(9, 22.5).world.y).toBeCloseTo(3.444150891, 9);
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
  });

  it('⭐ 极坐标 → 格点口径：r=9、22.5° ⇒ 列 29.315 / 行 17.556（小数，格索引存不下）', () => {
    expect(resolveOne(9, 22.5).lattice.col).toBeCloseTo(29.314915793, 6);
    expect(resolveOne(9, 22.5).lattice.row).toBeCloseTo(17.555849109, 6);
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

  it('⭐ marks **不含隐藏点**：21 个点位里只有 17 个会被渲染', () => {
    const marks = toGridMarks(RESOLVED);
    expect(RESOLVED).toHaveLength(21);
    expect(marks).toHaveLength(17);
    expect(visiblePoints(RESOLVED)).toHaveLength(17);
    expect(hiddenPoints(RESOLVED)).toHaveLength(4);
    // 顺序：marks[0]=主峰，[1..8]=八峰，[9..12]=四门，[13..16]=四院（预留位被滤掉）
    expect(marks[0]?.at).toEqual({ x: 0, y: 0 });
    expect(marks[9]?.at).toEqual({ x: GATE_RING_CELLS, y: 0 });
    expect(marks[13]?.at).toEqual({ x: COURT_RING_CELLS, y: 0 });
  });

  it('rings 带半径 + 线型：外环虚线、二环/内环实线、中心 r0（由绘制层跳过）', () => {
    expect(toGridRings()).toEqual([
      { radiusCells: GATE_RING_CELLS, dashed: true },
      { radiusCells: PEAK_RING_CELLS, dashed: false },
      { radiusCells: COURT_RING_CELLS, dashed: false },
      { radiusCells: 0, dashed: false },
    ]);
  });
});

describe('内环（四院）与「是否隐藏」字段', () => {
  const courts = RESOLVED.filter((point) => point.kind === 'court');
  const reserved = RESOLVED.filter((point) => point.kind === 'reserved');

  it('⭐ 内环也是 8 等分：四正 = 四院，四隅 = 预留位', () => {
    const slots = RESOLVED.filter((point) => point.ring === 'court');
    expect(slots).toHaveLength(COURT_SLOT_COUNT);
    expect(courts).toHaveLength(COURT_COUNT);
    expect(reserved).toHaveLength(COURT_SLOT_COUNT - COURT_COUNT);
    for (const slot of slots) {
      expect(slot.radiusCells).toBe(COURT_RING_CELLS);
    }
  });

  it('四院在四个正方向（0/90/180/270），命名按方位', () => {
    expect(courts.map((point) => point.angleDeg)).toEqual([0, 90, 180, 270]);
    expect(courts.map((point) => point.label)).toEqual(['四院·东', '四院·北', '四院·西', '四院·南']);
    expect(courts.map((point) => point.key)).toEqual(['court_1', 'court_2', 'court_3', 'court_4']);
  });

  it('预留位在四个对角方向（45/135/225/315），且**都带 hidden**', () => {
    expect(reserved.map((point) => point.angleDeg)).toEqual([45, 135, 225, 315]);
    expect(reserved.map((point) => point.label)).toEqual(['预留·东北', '预留·西北', '预留·西南', '预留·东南']);
    expect(reserved.map((point) => point.key)).toEqual(['inner_1', 'inner_2', 'inner_3', 'inner_4']);
    for (const point of reserved) {
      expect(point.hidden).toBe(true);
    }
  });

  it('⭐ 四院**没有** hidden（要渲染）；隐藏位仍能算出坐标（数据完整，只是不画）', () => {
    for (const point of courts) {
      expect(point.hidden).toBeUndefined();
    }
    // 坐标那部分用夹具（r=5、45°）验证，与数据表当前半径无关
    const ne = resolveOne(5, 45);
    expect(ne.world.x).toBeCloseTo(3.535533906, 9);
    expect(ne.world.y).toBeCloseTo(3.535533906, 9);
    expect(ne.lattice.col).toBeCloseTo(24.535533906, 6);
  });

  it('⭐ 隐藏只影响渲染：去掉一个 hidden 就多画一个点（这就是"启用预留位"的动作）', () => {
    const enabled = RESOLVED.map((point) => (point.key === 'inner_1' ? { ...point, hidden: undefined } : point));
    expect(toGridMarks(RESOLVED)).toHaveLength(17);
    expect(toGridMarks(enabled)).toHaveLength(18);
  });

  it('四正方向 + **整数半径** ⇒ 落在整数格点上（首尾对齐，格索引存得下）', () => {
    expect(resolveOne(5, 0).lattice).toEqual({ col: 26, row: 21 });
    expect(resolveOne(5, 90).lattice).toEqual({ col: 21, row: 16 });
    expect(resolveOne(5, 180).lattice).toEqual({ col: 16, row: 21 });
    expect(resolveOne(5, 270).lattice).toEqual({ col: 21, row: 26 });
  });
});

describe('滑杆：环半径可调（会话态，不动数据表）', () => {
  it('环表从外到内排列，且带用户口径的显示名（外环/二环/内环/中心）', () => {
    expect(MAP_RINGS.map((ring) => ring.key)).toEqual(['gate', 'peak', 'court', 'summit']);
    expect(MAP_RINGS.map((ring) => ring.label)).toEqual([
      '外环 · 四门',
      '二环 · 八峰',
      '内环 · 四院',
      '中心 · 主峰',
    ]);
  });

  it('只有可调的环给滑杆：中心（主峰）被排除', () => {
    expect(adjustableRings().map((ring) => ring.key)).toEqual(['gate', 'peak', 'court']);
  });

  it('默认半径表 = 数据表里的值（刷新回到这里）', () => {
    expect(defaultRingRadii()).toEqual({
      gate: GATE_RING_CELLS,
      peak: PEAK_RING_CELLS,
      court: COURT_RING_CELLS,
      summit: 0,
    });
  });

  it('⭐ 覆盖生效且**不改原表**（纯函数，滑杆调多久数据表都不动）', () => {
    const overridden = withRingRadii({ peak: 12.5 });
    expect(overridden.find((ring) => ring.key === 'peak')?.radiusCells).toBe(12.5);
    expect(overridden.find((ring) => ring.key === 'gate')?.radiusCells).toBe(GATE_RING_CELLS);
    // 原表没被改
    expect(MAP_RINGS.find((ring) => ring.key === 'peak')?.radiusCells).toBe(PEAK_RING_CELLS);
    expect(overridden).not.toBe(MAP_RINGS);
  });

  it('⭐ 中心（fixed）忽略覆盖 —— 主峰不该被拖走', () => {
    const overridden = withRingRadii({ summit: 8 });
    expect(overridden.find((ring) => ring.key === 'summit')?.radiusCells).toBe(0);
  });

  it('未知 key / 非数 ⇒ 该环保持默认（不猜、不拖到 0）', () => {
    const defaults = [GATE_RING_CELLS, PEAK_RING_CELLS, COURT_RING_CELLS, 0];
    expect(withRingRadii({ nope: 5 }).map((r) => r.radiusCells)).toEqual(defaults);
    expect(withRingRadii({ peak: Number.NaN }).map((r) => r.radiusCells)).toEqual(defaults);
    expect(withRingRadii({ peak: Number.POSITIVE_INFINITY }).map((r) => r.radiusCells)).toEqual(defaults);
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
