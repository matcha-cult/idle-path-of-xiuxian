/**
 * 点位的**派生**（极坐标 → 世界坐标 → 格点口径）与**滑杆口径**（调半径）。
 *
 * 这一层是**只读**的：它从不改数据表 —— 滑杆只是覆盖值，定稿后才由人写回 `map-catalog.ts`。
 * 于是"调半径"这件事不可能悄悄改坏地图数据，也解释了为什么界面上没有「保存」按钮。
 *
 * 纯函数：同样的输入永远同样的输出，所以点位可以被单测逐点核对。
 */
import { polarToWorld, worldToLattice } from '@idle-path/ui-kit';
import type { GridMark, WorldPoint } from '@idle-path/ui-kit';
import { MAP_CELLS, MAP_POINTS, MAP_RINGS, MARK_RADIUS_CELLS } from './map-catalog.js';
import type { MapPoint, MapRing, ResolvedMapPoint } from './map-types.js';

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

/** 把静态点位表解析成"可直接画"的点（极坐标 → 世界坐标 → 格点口径）。 */
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

/** 会被**渲染**的点（`hidden` 的不算）。渲染层与读数共用这一条口径，避免两处判断不一致。 */
export function visiblePoints(points: readonly ResolvedMapPoint[]): ResolvedMapPoint[] {
  return points.filter((point) => point.hidden !== true);
}

/** 只在数据里、不渲染的点（预留给未来启用的位置）。 */
export function hiddenPoints(points: readonly ResolvedMapPoint[]): ResolvedMapPoint[] {
  return points.filter((point) => point.hidden === true);
}

/**
 * 供 `<CanvasGrid marks>` 用：世界坐标 + 半径 + **key/label**（**隐藏点在这里被滤掉**）。
 *
 * 为什么要把 `key`/`label` 交给绘制层：点的悬停/点击回调要靠 `key` 才能回查到业务数据，
 * 光标标签则直接用 `label` 显示名字（"这是哪儿"）。绘制层不认识业务的其它字段。
 */
export function toGridMarks(points: readonly ResolvedMapPoint[]): GridMark[] {
  return visiblePoints(points).map((point) => ({
    key: point.key,
    label: point.label,
    at: point.world,
    radiusCells: MARK_RADIUS_CELLS,
  }));
}

/** 供 `<CanvasGrid rings>` 用：半径 + 线型（半径 0 的环由绘制层跳过）。 */
export function toGridRings(
  rings: readonly MapRing[] = MAP_RINGS,
): { radiusCells: number; dashed: boolean }[] {
  return rings.map((ring) => ({ radiusCells: ring.radiusCells, dashed: ring.dashed ?? false }));
}
