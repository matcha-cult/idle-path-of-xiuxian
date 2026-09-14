/**
 * `lab-objects` —— **「进入地图之后，加载目标地图的可交互对象」** 的建模（纯函数，零 store）。
 *
 * 用户原始意图（2026-09-14，逐字）：「进入地图之后，加载目标地图的可交互对象，如 npc，传送点，
 * 秘境入口，甚至是随机刷新的怪物」。
 *
 * ## 三类对象的来源（**来源不同，这点必须写清楚**）
 * | kind | 来源 | 说明 |
 * | --- | --- | --- |
 * | `waypoint` 传送点 | **节点上的 `hasWaypoint`**（前端派生） | `game_map_objects` 今天只有 `office` 一类，**还没有** `waypoint` 对象 —— 而 `14-...md` §4.2 的设计正是把传送点做成 `kind='waypoint'` 的对象。这里按那个设计**前端派生**出来，等后端补上对象行后改一处即可 |
 * | `realm` 秘境入口 | 节点上的 `featureKey === 'realm'`（前端派生） | 与旧面板的 `REALM_FEATURE_KEY` 同一判据（第八峰·后山） |
 * | `office` 职能入口 | **服务端 `game_map_objects`** | 藏经阁 / 丹霞院 / 百器阁…原样透传 |
 *
 * 「随机刷新的怪物」**不进这张表**：`14-...md` §4.3 已判定它该走在线 tick（做成持久对象会开出
 * 「离线也能刷」的口子，与核心循环冲突）。这条结论本轮沿用，未改。
 *
 * 边界：宿主节点不在下发集合里的对象**整条丢弃**（悬挂对象不显示，也不回显协议 code）；
 * 空输入返回空数组；`nodes` 顺序决定同 kind 内的展示顺序（服务端已按 `orderIndex` 排好）。
 */
import type { MapNodeView, MapObjectView } from '@idle-path/ionet-transport';
import { REALM_FEATURE_KEY } from '../game/panels/map/feature-registry.js';

export type LabObjectKind = 'waypoint' | 'realm' | 'office';

/** 展示名（协议 `kind` 原文不上屏）。 */
export const LAB_KIND_LABELS: Record<LabObjectKind, string> = {
  waypoint: '传送点',
  realm: '秘境入口',
  office: '职能入口',
};

export interface LabObject {
  /** 稳定 key（列表 key 与 testid；传送点用 `wp:<节点>`，秘境用 `realm:<节点>`，职能用服务端 object code）。 */
  key: string;
  kind: LabObjectKind;
  /** 展示名（中文）。 */
  name: string;
  /** 宿主枢纽 code。 */
  nodeCode: string;
  /** 宿主枢纽名（列表里要告诉玩家「这个对象在哪」）。 */
  nodeName: string;
  description: string | null;
  featureKey: string | null;
  /** 一次性交互是否已完成（只有传送点有语义：已交互 = 已点亮）。 */
  done: boolean;
}

export function waypointKeyOf(nodeCode: string): string {
  return `wp:${nodeCode}`;
}

export function realmKeyOf(nodeCode: string): string {
  return `realm:${nodeCode}`;
}

/**
 * 汇总本图全部可交互对象。
 *
 * @param nodes 服务端下发的节点（本图）
 * @param objects 服务端下发的职能对象（本图全量）
 * @param unlocked **本会话已交互点亮**的传送点集合（见 `waypoint-gate.ts`）
 */
export function buildLabObjects(
  nodes: readonly MapNodeView[],
  objects: readonly MapObjectView[],
  unlocked: ReadonlySet<string>,
): LabObject[] {
  const byCode = new Map(nodes.map((node) => [node.code, node]));
  const waypoints: LabObject[] = nodes
    .filter((node) => node.hasWaypoint)
    .map((node) => ({
      key: waypointKeyOf(node.code),
      kind: 'waypoint',
      name: `${node.name}传送点`,
      nodeCode: node.code,
      nodeName: node.name,
      description: node.description,
      featureKey: 'waypoint',
      done: unlocked.has(node.code),
    }));
  const realms: LabObject[] = nodes
    .filter((node) => node.featureKey === REALM_FEATURE_KEY)
    .map((node) => ({
      key: realmKeyOf(node.code),
      kind: 'realm',
      name: `${node.name} · 秘境石台`,
      nodeCode: node.code,
      nodeName: node.name,
      description: node.description,
      featureKey: node.featureKey,
      done: false,
    }));
  const offices: LabObject[] = objects.flatMap((object) => {
    const host = byCode.get(object.nodeCode);
    // 宿主节点未下发 → 整条丢弃（不造点、不回显 code）
    if (host === undefined) return [];
    return [
      {
        key: object.code,
        kind: 'office' as const,
        name: object.name,
        nodeCode: object.nodeCode,
        nodeName: host.name,
        description: object.description,
        featureKey: object.featureKey,
        done: false,
      },
    ];
  });
  return [...waypoints, ...realms, ...offices];
}

/** 某个地点的可交互对象（右栏「此处可交互」用）。 */
export function objectsOfNode(all: readonly LabObject[], nodeCode: string): LabObject[] {
  return all.filter((object) => object.nodeCode === nodeCode);
}

/** 各类对象计数（概览统计用）。 */
export function labKindCounts(all: readonly LabObject[]): Record<LabObjectKind, number> {
  const counts: Record<LabObjectKind, number> = { waypoint: 0, realm: 0, office: 0 };
  for (const object of all) counts[object.kind] += 1;
  return counts;
}
