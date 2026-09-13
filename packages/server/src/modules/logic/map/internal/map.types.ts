/**
 * map 域共享类型（settings-revision-2 §5.3 / §7.3）
 *
 * 行的字段名直接对齐 `packages/server/prisma/schema.prisma:414-478` 的四张表
 * （`game_maps` / `game_map_nodes` / `game_map_edges` / `game_node_progress`）。
 */
export { type FailResult, fail } from '../../../../common/kernel/result.js';

/** `game_maps` 行（schema.prisma:414-429） */
export interface MapRow {
  id: number;
  code: string;
  name: string;
  world: string;
  order_index: number;
  chapter_from: number;
  chapter_to: number;
  requires_map_code: string | null;
  description: string | null;
  /** 坐标空间行数：交叉线索引 `0..grid_rows`（P1 画布，§14.1） */
  grid_rows: number;
  /** 坐标空间列数：交叉线索引 `0..grid_cols` */
  grid_cols: number;
  /** 预留：底图资源 key（本轮恒为 null） */
  background_key: string | null;
}

/** `game_map_nodes` 行（schema.prisma:431-452） */
export interface MapNodeRow {
  id: number;
  code: string;
  map_id: number;
  name: string;
  ring: string;
  sector: string | null;
  kind: string;
  feature_key: string | null;
  /**
   * 怪物境界（固定）。**只有 `kind === 'secret_realm'` 的节点有值**，
   * 其余是职能型枢纽（宗门内不刷同门）→ `null`。右栏据此分流显示。
   */
  level: number | null;
  /** 固定战力门槛（§6）。与 `level` 同口径：非秘境节点为 `null`。 */
  threshold: number | null;
  has_waypoint: boolean;
  chapter: number;
  requires_node_code: string | null;
  /** kind=secret_realm 时指向 game_zones.code */
  zone_code: string | null;
  order_index: number;
  /** 0-based 交叉线索引，`0..grid_rows`（P1 画布） */
  grid_row: number;
  /** 0-based 交叉线索引，`0..grid_cols` */
  grid_col: number;
  /** 风味文案（悬停卡 / 右栏详情） */
  description: string | null;
}

/**
 * 安全整数解析：把驱动返回的「字符串数字 / bigint / null」等收敛成有限整数。
 *
 * 为什么需要它：`pg` 对 `SMALLINT` 返回 number、对 `INT8`/聚合返回 string，
 * 而漏写 `SELECT` 列表时字段是 `undefined` —— 直接 `Number(undefined)` 得到 `NaN`，
 * `JSON.stringify` 会把 `NaN` 序列化成 `null`，**静默**进入协议。
 * 这里统一回退到 `fallback`，并拒绝负数（坐标为 0-based 交叉线索引，负值非法）。
 */
export function safeInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

/**
 * 可空整数列的视图转换：`null` / `undefined` / 非有限数一律保持 `null`。
 *
 * ⚠️ **不要用 `safeInt` / `Number()` 处理 `level` / `threshold`**：`Number(null) === 0`，
 * 会把「此地没有怪物」静默变成「怪物境界 0 / 门槛 0」，正是 T1 要修的那个荒诞。
 */
export function optionalInt(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** `game_map_edges` 行（schema.prisma:454-463） */
export interface MapEdgeRow {
  id: number;
  map_id: number;
  from_node_id: number;
  to_node_id: number;
  bidirectional: boolean;
}

/** `game_map_objects` 行（P2.0 §3；一院多职能的明细） */
export interface MapObjectRow {
  id: number;
  code: string;
  map_id: number;
  /** 宿主枢纽（四院或主峰） */
  node_code: string;
  /** office = 职能入口（本轮唯一类型） */
  kind: string;
  name: string;
  /** 要打开的系统；本轮 11 个对象全部非空 */
  feature_key: string | null;
  description: string | null;
  order_index: number;
}

/** 对象视图（协议 dto.ts 的 `MapObjectView` 同形） */
export interface MapObjectView {
  id: number;
  code: string;
  nodeCode: string;
  kind: string;
  name: string;
  featureKey: string | null;
  description: string | null;
  orderIndex: number;
}

/** 行 → 视图（数字列统一收敛，避免驱动返回字符串 / undefined 时 NaN 静默进协议）。 */
export function objectView(row: MapObjectRow): MapObjectView {
  return {
    id: Number(row.id),
    code: row.code,
    nodeCode: row.node_code,
    kind: row.kind,
    name: row.name,
    featureKey: row.feature_key ?? null,
    description: row.description ?? null,
    orderIndex: safeInt(row.order_index, 0),
  };
}

/** `game_node_progress` 行（schema.prisma:465-478） */
export interface NodeProgressRow {
  id: number;
  character_id: number;
  node_id: number;
  visited: boolean;
  waypoint_unlocked: boolean;
  idle_unlocked: boolean;
  cleared: boolean;
}

/** `game_map_state` 行（P2.0 §5）：角色当前所在。`current_node_id` 可空 = 新角色。 */
export interface MapStateRow {
  character_id: number;
  current_node_id: number | null;
}

/** 单节点进度视图（协议 dto.ts 的 `NodeProgressView` 同形） */
export interface NodeProgressView {
  visited: boolean;
  waypointUnlocked: boolean;
  idleUnlocked: boolean;
  cleared: boolean;
}

/** 无进度行时的默认视图（与 `game_node_progress` 的列默认值一致） */
export function progressView(row: NodeProgressRow | null | undefined): NodeProgressView {
  if (!row) return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false };
  return {
    visited: Boolean(row.visited),
    waypointUnlocked: Boolean(row.waypoint_unlocked),
    idleUnlocked: Boolean(row.idle_unlocked),
    cleared: Boolean(row.cleared),
  };
}

/**
 * 计算「已发现（可见）节点」的 code 集合（§5.2「到达即发现」）。
 *
 * 可见的三种情形：
 * - `requires_node_code` 为 null / 空串（入口节点）→ 始终可见；
 * - 前置节点已 `visited` → 可见；
 * - 节点自身已 `visited` → 可见（兜底：进度行可能先于前置写入，如直接挑战秘境）。
 *
 * `requires_node_code` 指向**不存在**的节点时，该节点永不可见（配置错误表现为锁定，
 * 而不是把不该开放的区域放行）。
 */
export function discoveredCodes(
  nodes: readonly MapNodeRow[],
  progressByNodeId: ReadonlyMap<number, NodeProgressRow>,
): Set<string> {
  const visited = new Set<string>();
  for (const node of nodes) {
    if (progressByNodeId.get(Number(node.id))?.visited) visited.add(node.code);
  }
  const discovered = new Set<string>();
  for (const node of nodes) {
    const requires = node.requires_node_code;
    if (requires == null || requires === '') {
      discovered.add(node.code);
      continue;
    }
    if (visited.has(node.code) || visited.has(requires)) discovered.add(node.code);
  }
  return discovered;
}

/**
 * 地图解锁判定（R2 D4 / §5.6）：**章节完成即解锁**。
 *
 * 规则：`requires_map_code` 为 null 的地图是入口（本世界的第一张图）；
 * 其余地图要求**其前置地图的 `chapter_to` 章节已完成** ——
 * 即「推完前置图的最后一章 → 解锁下一张图」。
 *
 * 判定按 `order_index` 升序单趟推进，因此支持链式（图 3 要求图 2、图 2 要求图 1）。
 * 前置地图不存在（配置错误）时该图**永不解锁** —— 与 `discoveredCodes` 同一口径：
 * **配置错误表现为锁定，而不是把不该开放的世界放行**。
 *
 * 为什么把规则放这里而不是散在 SQL 里：它是玩法规则，且必须能不连库地单测
 * （链式、缺前置、章节未完成三种情形）。
 */
export function unlockedMapCodes(
  maps: readonly MapRow[],
  completedChapters: ReadonlySet<number>,
): Set<string> {
  const ordered = [...maps].sort((a, b) => Number(a.order_index) - Number(b.order_index));
  const byCode = new Map(maps.map((m) => [m.code, m]));
  const unlocked = new Set<string>();
  for (const map of ordered) {
    const requires = map.requires_map_code;
    if (requires == null || requires === '') {
      unlocked.add(map.code);
      continue;
    }
    const predecessor = byCode.get(requires);
    if (predecessor === undefined) continue; // 前置不存在 → 永不解锁（配置错误的保守表现）
    if (unlocked.has(predecessor.code) && completedChapters.has(Number(predecessor.chapter_to))) {
      unlocked.add(map.code);
    }
  }
  return unlocked;
}
