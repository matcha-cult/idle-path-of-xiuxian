/**
 * 地图点位数据模型 —— 目前落地「1 主峰 + 8 功能峰（r=9，错开 22.5°）+ 4 宗门门（r=10，正方向）」。
 *
 * ## 存放口径（用户 2026-09-15：「从现在开始，你需要考虑每一个点的数据存放方法」）
 *
 * 1. **环（轨道）单独定义，点只引用环**：点存 `ring` + `angleDeg`，半径只写在环上。
 *    「功能峰环从 9 格改成 10 格」改一个数，8 个点全跟着动；若 8 个点各存一份半径，
 *    就有 8 次改错的机会。
 * 2. **只存极坐标，不存 (x, y)**：斜向峰的世界坐标是 `9/√2` 这种无理数，存下来既难读，
 *    又会在改半径后失效。**更关键的是：格点索引根本存不下它** ——
 *    r=9、45° 的格点坐标是 `(27.364, 14.636)`，不是整数；相位改成 22.5° 之后
 *    **8 个峰的格点坐标全都不是整数**。老地图八峰被"吸附"成两种半径、角度最大偏 7.2°
 *    的歪斜，根因就是把这类点硬压成了整数格点。所以 (x, y) 与格点坐标都是**派生值**。
 * 3. **`key` 稳定、与显示名解耦**：运行期状态（是否发现 / 是否解锁 / 是否选中）只挂 `key`，
 *    以后改名、换顺序、换方位都不会丢状态。
 * 4. **与数据库的分工**：数据库的权威是 `grid_col/grid_row`（格索引）+ 邻接关系；
 *    这张表是**渲染与几何**的定义。两者由 `worldToLattice` 一对换算连接（只在一处）。
 *    将来后端要下发点位，只需 `{ key, ring, angleDeg }` 三个数 —— 比下发格索引更稳。
 */
import { polarToWorld, ringAngles, worldToLattice } from '@idle-path/ui-kit';
import type { WorldPoint } from '@idle-path/ui-kit';

/** 每轴格子数（地图的几何基础；网格与点位共用这一个数）。 */
export const MAP_CELLS = 42;

/** 点位的功能类型（四院已在列，等它上环时直接用）。 */
export type MapPointKind = 'summit' | 'peak' | 'court' | 'gate';

/** 环（轨道）：**半径与线型的口径只写在这里**。 */
export interface MapRing {
  key: string;
  /** 显示名（滑杆与读数上用**用户的词汇**：外环/二环/内环，避免各说各话） */
  label: string;
  /** 环半径（格单位） */
  radiusCells: number;
  /** 画成虚线（视觉语言：把「宗门大阵圈」与「八峰轨道」区分开） */
  dashed?: boolean;
  /** 半径**不可调**（中心 = 主峰，恒为 0；滑杆不给它，免得把中心拖出去） */
  fixed?: boolean;
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

/** 功能峰所在环的半径（格）。 */
export const PEAK_RING_CELLS = 9;

/** 宗门门所在环的半径（格）—— 沿用旧种子数据 `outer` 环 r=10 的口径。 */
export const GATE_RING_CELLS = 10;

/**
 * 环定义，**从外到内**排列（与用户报环顺序一致：外环 → 二环 → 中心）。
 * 主峰也建成一条**半径 0 的环**，是为了让所有点走**同一套代码** ——
 * 特殊分支越少，越不容易出现"主峰画了、峰忘了画"这种半成品；
 * 它的 `fixed` 让它不出现在滑杆里（中心不该被拖走），半径 0 的环也由绘制层跳过。
 */
export const MAP_RINGS: readonly MapRing[] = [
  { key: 'gate', label: '外环 · 四门', radiusCells: GATE_RING_CELLS, dashed: true },
  { key: 'peak', label: '二环 · 八峰', radiusCells: PEAK_RING_CELLS },
  { key: 'summit', label: '中心 · 主峰', radiusCells: 0, fixed: true },
];

/** 功能峰数量（8 等分）。 */
export const PEAK_COUNT = 8;

/** 宗门门数量（四个正方向）。 */
export const GATE_COUNT = 4;

/**
 * 功能峰的**相位**（度）：第一颗峰从哪个角度开始。
 *
 * `22.5` ⇒ 整环错开半个扇区，**东西南北四个正方向空出来留给四门**
 *（用户 2026-09-15 定的口径；旧种子数据也是这个相位）。代价是：峰不再落在任何一个
 * 具名方位上，所以它们只能按序号命名。
 */
export const PEAK_PHASE_DEG = 22.5;

/**
 * 二环八峰的名字：**按序号**，不按方位。
 *
 * 为什么不用「东/东北/北…」：那是相位 0 的产物。相位改成 22.5° 后，每颗峰正好落在两个
 * 具名方位**之间**，继续叫「功能峰·东」就是错的 —— 名字跟着口径变，才不会骗人。
 * 另外「功能峰」这个词在本图里指**内环那一层功能区（含四院）**，所以二环这 8 个点统一叫
 * **八峰**，避免和用户自己的词汇打架。正式名称以后由数据表给出，`key` 不受影响。
 */
const PEAK_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八'] as const;

/** 宗门门的名字（四个正方向，按角度递增：0° 东 → 90° 北 → 180° 西 → 270° 南）。 */
const GATE_LABELS = ['东门', '北门', '西门', '南门'] as const;

/** 功能点半径（格单位）：口径「直径 = 1 格」⇒ `0.5`。所有点位共用同一口径。 */
export const MARK_RADIUS_CELLS = 0.5;

/** 地图点位表（静态定义：只写"是什么、在哪条环、环上几度"）。 */
export const MAP_POINTS: readonly MapPoint[] = [
  { key: 'summit', kind: 'summit', label: '主峰', ring: 'summit' },
  ...ringAngles(PEAK_COUNT, PEAK_PHASE_DEG).map((angleDeg, index) => ({
    key: `peak_${index + 1}`,
    kind: 'peak' as const,
    label: `八峰·${PEAK_LABELS[index] ?? `#${index + 1}`}`,
    ring: 'peak',
    angleDeg,
  })),
  ...ringAngles(GATE_COUNT, 0).map((angleDeg, index) => ({
    key: `gate_${index + 1}`,
    kind: 'gate' as const,
    label: `宗门·${GATE_LABELS[index] ?? `#${index + 1}`}`,
    ring: 'gate',
    angleDeg,
  })),
];

/** 解析后的点：附上**派生值**（世界坐标 + 数据库格点口径）。 */
export interface ResolvedMapPoint extends MapPoint {
  /** 环半径（格单位） */
  radiusCells: number;
  /** 派生：世界坐标（格单位，原点 = 主峰，y 向上） */
  world: WorldPoint;
  /** 派生：数据库格点口径（环上的点大多是小数 —— 这是事实，不要四舍五入掉） */
  lattice: { col: number; row: number };
}

/** 取环半径；未知环 ⇒ null（数据写错由单测兜底，运行期不抛错）。 */
export function ringRadiusCells(ringKey: string, rings: readonly MapRing[] = MAP_RINGS): number | null {
  const ring = rings.find((r) => r.key === ringKey);
  return ring === undefined ? null : ring.radiusCells;
}

/** 滑杆范围（格）：0 … 半幅（42 格 ⇒ ±21；超过半幅环就画到网格外了）。 */
export const RING_RADIUS_LIMITS = { min: 0, max: MAP_CELLS / 2, step: 0.5 } as const;

/** 把半径夹进滑杆范围（拖动 / 手输 / 脏数据都不会越界）。非数 ⇒ 下限。 */
export function clampRadius(value: number): number {
  if (!Number.isFinite(value)) return RING_RADIUS_LIMITS.min;
  return Math.min(RING_RADIUS_LIMITS.max, Math.max(RING_RADIUS_LIMITS.min, value));
}

/**
 * 用滑杆值覆盖环半径（**纯函数**，不改原表）。
 *
 * 未知 key / 非数 ⇒ 该环保持默认（不猜、不把它拖到 0），`fixed` 的环（中心）直接忽略。
 * 这样"调半径"永远只影响几何，不会悄悄改掉数据表本身 —— 定稿后再把数字写回数据表。
 */
export function withRingRadii(
  overrides: Readonly<Record<string, number>>,
  rings: readonly MapRing[] = MAP_RINGS,
): MapRing[] {
  return rings.map((ring) => {
    const next = overrides[ring.key];
    if (ring.fixed === true || next === undefined || !Number.isFinite(next)) return ring;
    return { ...ring, radiusCells: clampRadius(next) };
  });
}

/** 可以给滑杆的环（中心固定，不给）。 */
export function adjustableRings(rings: readonly MapRing[] = MAP_RINGS): MapRing[] {
  return rings.filter((ring) => ring.fixed !== true);
}

/** 默认半径表（滑杆的初始值；刷新即回到这里——持久化的位置是数据表本身）。 */
export function defaultRingRadii(rings: readonly MapRing[] = MAP_RINGS): Record<string, number> {
  return Object.fromEntries(rings.map((ring) => [ring.key, ring.radiusCells]));
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

/** 供 `<CanvasGrid rings>` 用：半径 + 线型（半径 0 的环由绘制层跳过）。 */
export function toGridRings(
  rings: readonly MapRing[] = MAP_RINGS,
): { radiusCells: number; dashed: boolean }[] {
  return rings.map((ring) => ({ radiusCells: ring.radiusCells, dashed: ring.dashed ?? false }));
}
