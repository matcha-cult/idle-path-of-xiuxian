/**
 * 地图点位数据模型 —— 本轮落地「1 主峰 + 8 功能峰（半径 9 格、8 等分）」。
 *
 * ## 存放口径（用户 2026-09-15：「从现在开始，你需要考虑每一个点的数据存放方法」）
 *
 * 1. **环（轨道）单独定义，点只引用环**：点存 `ring` + `angleDeg`，半径只写在环上。
 *    「功能峰环从 9 格改成 10 格」改一个数，8 个点全跟着动；若 8 个点各存一份半径，
 *    就有 8 次改错的机会。
 * 2. **只存极坐标，不存 (x, y)**：斜向峰的世界坐标是 `9/√2` 这种无理数，存下来既难读，
 *    又会在改半径后失效。**更关键的是：格点索引根本存不下它** —— 45° 方向 r=9 的格点
 *    坐标是 `(27.364, 14.636)`，不是整数。老地图八峰被"吸附"成两种半径、角度最大偏 7.2°
 *    的歪斜，根因就是把这类点硬压成了整数格点。所以 (x, y) 与格点坐标都是**派生值**。
 * 3. **`key` 稳定、与显示名解耦**：运行期状态（是否发现 / 是否解锁 / 是否选中）只挂 `key`，
 *    以后改名、换顺序、换方位都不会丢状态。
 * 4. **与数据库的分工**：数据库的权威是 `grid_col/grid_row`（格索引）+ 邻接关系；
 *    这张表是**渲染与几何**的定义。两者由 `worldToLattice` 一对换算连接（只在一处）。
 *    将来后端要下发点位，只需 `{ key, ring, angleDeg }` 三个数 —— 比下发格索引更稳
 *    （改半径不用改数据，也不会被整数吸附）。
 */
import { polarToWorld, ringAngles, worldToLattice } from '@idle-path/ui-kit';
import type { WorldPoint } from '@idle-path/ui-kit';

/** 每轴格子数（地图的几何基础；网格与点位共用这一个数）。 */
export const MAP_CELLS = 42;

/** 点位的功能类型（四院/四门已在列，等它们上环时直接用）。 */
export type MapPointKind = 'summit' | 'peak' | 'court' | 'gate';

/** 环（轨道）：**半径的口径只写在这里**。 */
export interface MapRing {
  key: string;
  /** 环半径（格单位） */
  radiusCells: number;
}

export interface MapPoint {
  key: string;
  kind: MapPointKind;
  label: string;
  /** 所在环的 `key` */
  ring: string;
  /** 环上角度（度）：0° = 正东、逆时针为正；环心点（半径 0）省略 */
  angleDeg?: number;
}

/** 功能峰所在环的半径（格）；文字说明与环定义共用这一个数。 */
export const PEAK_RING_CELLS = 9;

/**
 * 环定义。主峰也建成一条**半径 0 的环**，是为了让 9 个点走**同一套代码** ——
 * 特殊分支越少，越不容易出现"主峰画了、峰忘了画"这种半成品（半径 0 的环由绘制层跳过）。
 */
export const MAP_RINGS: readonly MapRing[] = [
  { key: 'summit', radiusCells: 0 },
  { key: 'peak', radiusCells: PEAK_RING_CELLS },
];

/** 功能峰的方位（按角度递增）—— 后天八卦的八个方位。 */
const PEAK_DIRECTIONS = ['东', '东北', '北', '西北', '西', '西南', '南', '东南'] as const;

/**
 * 相位（度）：第一颗功能峰从哪里开始。
 *
 * `0` ⇒ 有一颗正对**正北**（90°），正是后天八卦的八个方位。
 * 若要让"四正"（东西南北）空出来留给四门，改成 `22.5` 即可 —— **整环一起转**，
 * 因为每颗峰的角度都从这一个常数派生。
 */
export const PEAK_PHASE_DEG = 0;

/** 功能峰数量（8 等分）。 */
export const PEAK_COUNT = 8;

/** 功能点半径（格单位）：口径「直径 = 1 格」⇒ `0.5`。主峰与 8 峰共用同一口径。 */
export const MARK_RADIUS_CELLS = 0.5;

/** 地图点位表（静态定义：只写"是什么、在哪条环、环上几度"）。 */
export const MAP_POINTS: readonly MapPoint[] = [
  { key: 'summit', kind: 'summit', label: '主峰', ring: 'summit' },
  ...ringAngles(PEAK_COUNT, PEAK_PHASE_DEG).map((angleDeg, index) => ({
    key: `peak_${index + 1}`,
    kind: 'peak' as const,
    label: `功能峰·${PEAK_DIRECTIONS[index] ?? `#${index + 1}`}`,
    ring: 'peak',
    angleDeg,
  })),
];

/** 解析后的点：附上**派生值**（世界坐标 + 数据库格点口径）。 */
export interface ResolvedMapPoint extends MapPoint {
  /** 环半径（格单位） */
  radiusCells: number;
  /** 派生：世界坐标（格单位，原点 = 主峰，y 向上） */
  world: WorldPoint;
  /** 派生：数据库格点口径（斜向峰是小数 —— 这是事实，不要四舍五入掉） */
  lattice: { col: number; row: number };
}

/** 取环半径；未知环 ⇒ null（数据写错由单测兜底，运行期不抛错）。 */
export function ringRadiusCells(ringKey: string, rings: readonly MapRing[] = MAP_RINGS): number | null {
  const ring = rings.find((r) => r.key === ringKey);
  return ring === undefined ? null : ring.radiusCells;
}

/**
 * 把静态点位表解析成"可直接画"的点（极坐标 → 世界坐标 → 格点口径）。
 * 纯函数：同样的输入永远同样的输出，所以点位可以被单测逐点核对。
 */
export function resolveMapPoints(
  points: readonly MapPoint[] = MAP_POINTS,
  rings: readonly MapRing[] = MAP_RINGS,
  cells: number = MAP_CELLS,
): ResolvedMapPoint[] {
  return points.map((point) => {
    const radiusCells = ringRadiusCells(point.ring, rings) ?? 0;
    const world = polarToWorld(radiusCells, point.angleDeg ?? 0);
    return { ...point, radiusCells, world, lattice: worldToLattice(world, cells, cells) };
  });
}

/** 供 `<CanvasGrid marks>` 用：世界坐标 + 半径（都不含业务含义）。 */
export function toGridMarks(points: readonly ResolvedMapPoint[]): { at: WorldPoint; radiusCells: number }[] {
  return points.map((point) => ({ at: point.world, radiusCells: MARK_RADIUS_CELLS }));
}

/** 供 `<CanvasGrid rings>` 用：半径（格单位）。 */
export function toGridRings(rings: readonly MapRing[] = MAP_RINGS): { radiusCells: number }[] {
  return rings.map((ring) => ({ radiusCells: ring.radiusCells }));
}
