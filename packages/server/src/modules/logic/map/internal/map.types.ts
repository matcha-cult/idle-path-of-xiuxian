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
  level: number;
  threshold: number;
  has_waypoint: boolean;
  chapter: number;
  requires_node_code: string | null;
  /** kind=secret_realm 时指向 game_zones.code */
  zone_code: string | null;
  order_index: number;
}

/** `game_map_edges` 行（schema.prisma:454-463） */
export interface MapEdgeRow {
  id: number;
  map_id: number;
  from_node_id: number;
  to_node_id: number;
  bidirectional: boolean;
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
