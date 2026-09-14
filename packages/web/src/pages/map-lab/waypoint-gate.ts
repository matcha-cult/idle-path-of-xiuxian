/**
 * `waypoint-gate` —— **「必须和传送点交互之后才可解锁传送」** 的判定（纯函数，零 store）。
 *
 * 用户原始意图（2026-09-14，逐字）：「必须和传送点交互之后才可解锁传送。」
 *
 * ## 与现状的差别（这是本模块存在的理由）
 * 服务端 `map.service.ts` 目前在**首次到达**节点时就自动把 `waypoint_unlocked` 置真
 * （见 `14-...md` §4.2：那条规则要改成「首次到达使传送点**变为可交互**，交互后点亮」）。
 * 本轮**不改后端**（用户要求「非必要不修改后端」），因此门槛落在前端：
 *
 * - **可传送** ⟺ 本会话在该节点**与传送点交互过**（`unlocked` 集合）；
 * - 服务端下发的 `progress.waypointUnlocked` **不参与**这条判定 —— 否则新角色走一步就被
 *   自动点亮，交互这一步会被完全绕过去，机制也就不存在了。
 *
 * ⚠️ **这是原型口径**：`unlocked` 是**会话态**（刷新即回初始），它不是玩家资产。
 * 持久化解锁需要后端 `map.interact` + 对象进度表（`24-总待办与优先级.md` §2 B1），
 * 本轮不做，已登记为下一步。
 */
import type { MapNodeView } from '@idle-path/ionet-transport';

/** 前往方式：`here` 已在原地 / `walk` 相邻直接走 / `teleport` 传送 / `blocked` 去不了。 */
export type TravelKind = 'here' | 'walk' | 'teleport' | 'blocked';

export interface TravelDecision {
  kind: TravelKind;
  /** 上屏提示（`blocked` 时说明「为什么不能去」，这是教学玩家机制的唯一出口）。 */
  hint: string;
}

export const HERE_HINT = '你正在此地';
export const WALK_HINT = '有线路直接相连，可直接前往';
export const TELEPORT_HINT = '传送点已点亮，可传送至此';
/** 有传送点但没交互过 —— 这一句就是「交互才解锁传送」的玩家可见形态。 */
export const WAYPOINT_LOCKED_HINT = '需先在此地与传送点交互，才能解锁传送';
export const NO_WAYPOINT_HINT = '与当前所在地不相邻，且此处没有传送点';

/**
 * 判定某个地点的前往方式。
 *
 * 优先级：**已在原地 > 相邻（免费，无战力门槛）> 传送（需已点亮）> 去不了**。
 * 相邻优先于传送是有意的：走路不消耗任何东西，不该被当成传送。
 * 边界：`currentCode` 为 null（新角色）时没有地点是「原地」；`unlocked` 为空集时全部走不了。
 */
export function travelDecision(
  node: MapNodeView,
  currentCode: string | null,
  unlocked: ReadonlySet<string>,
): TravelDecision {
  if (currentCode !== null && node.code === currentCode) return { kind: 'here', hint: HERE_HINT };
  if (node.adjacent) return { kind: 'walk', hint: WALK_HINT };
  if (node.hasWaypoint && unlocked.has(node.code)) return { kind: 'teleport', hint: TELEPORT_HINT };
  if (node.hasWaypoint) return { kind: 'blocked', hint: WAYPOINT_LOCKED_HINT };
  return { kind: 'blocked', hint: NO_WAYPOINT_HINT };
}

/** 该地点在画布上是否可点（不可点 = 暗色 disabled，点击不改变选中态）。 */
export function isNodeReachable(
  node: MapNodeView,
  currentCode: string | null,
  unlocked: ReadonlySet<string>,
): boolean {
  return travelDecision(node, currentCode, unlocked).kind !== 'blocked';
}

/**
 * 传送点交互区的状态。
 *
 * ⚠️ **必须「人在该节点」才能交互**（`elsewhere`）：否则玩家可以在任意地方隔空点亮传送点，
 * 「跑图」就退回成「经过」，机制也就废了 —— 用户要的正是「玩家在山门前必须停一下点一下」。
 */
export type WaypointInteractKind = 'none' | 'ready' | 'elsewhere' | 'done';

export interface WaypointInteractState {
  kind: WaypointInteractKind;
  hint: string;
}

export const NO_WAYPOINT_HERE_HINT = '此地没有传送点';
export const WAYPOINT_READY_HINT = '与传送点交互即可点亮，之后可从任意地点传送至此';
export const WAYPOINT_ELSEWHERE_HINT = '需先到达此地，才能与传送点交互';
export const WAYPOINT_DONE_HINT = '已点亮，可从任意地点传送至此';

export function waypointInteractState(
  node: MapNodeView,
  currentCode: string | null,
  unlocked: ReadonlySet<string>,
): WaypointInteractState {
  if (!node.hasWaypoint) return { kind: 'none', hint: NO_WAYPOINT_HERE_HINT };
  if (unlocked.has(node.code)) return { kind: 'done', hint: WAYPOINT_DONE_HINT };
  if (currentCode !== null && node.code === currentCode) return { kind: 'ready', hint: WAYPOINT_READY_HINT };
  return { kind: 'elsewhere', hint: WAYPOINT_ELSEWHERE_HINT };
}

/** 与传送点交互：把该节点加入已点亮集合（返回新集合，**不改入参**）。 */
export function unlockWaypoint(unlocked: ReadonlySet<string>, nodeCode: string): ReadonlySet<string> {
  const next = new Set(unlocked);
  next.add(nodeCode);
  return next;
}

/** 已点亮传送点的数量（供概览统计；协议字段不上屏）。 */
export function unlockedCount(
  nodes: readonly MapNodeView[],
  unlocked: ReadonlySet<string>,
): number {
  return nodes.filter((node) => node.hasWaypoint && unlocked.has(node.code)).length;
}
