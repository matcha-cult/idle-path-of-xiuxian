/**
 * 地图面板的**纯逻辑**（不 render，单独成文件便于单测）。
 *
 * 只做「把服务端给的值翻译成玩家看得懂的分组/文案/可达性」，**不含任何业务规则**：
 * - 哪些节点可见：服务端已过滤（只下发已发现），这里绝不自行造节点；
 * - 战力门槛：只用服务端 `threshold` 与 `playerPower` 比较（恰好等于 = 可进入）；
 * - 邻接：只用服务端下发的边，且必须过滤「引用了未下发节点」的悬挂边。
 */
import type { MapEdgeView, MapNodeView } from '@idle-path/ionet-transport';
import { featureIsImplemented, featureLabelOf } from './feature-registry.js';

/** 环层展示顺序（外环山门 → 外门接引 → 八峰 → 内环功能 → 中央主峰）。 */
export const RING_ORDER: readonly string[] = ['outer', 'approach', 'peaks', 'inner', 'summit'];

/** 未知环层的兜底文案。 */
const UNKNOWN_RING_LABEL = '其他';

const RING_LABELS: Record<string, string> = {
  outer: '外环山门',
  approach: '外门接引',
  peaks: '八峰',
  inner: '内环功能',
  summit: '中央主峰',
};

/** 环层展示名（未知环层兜底「其他」，不回显协议原文）。 */
export function ringLabel(ring: string): string {
  return RING_LABELS[ring] ?? UNKNOWN_RING_LABEL;
}

/** `kind` 只有三种：跑图 / 秘境（全图仅后山峰一个）/ 主峰。 */
const KIND_LABELS: Record<string, string> = {
  route: '跑图',
  secret_realm: '秘境',
  summit: '主峰',
};

/** 节点类型展示名（未知类型兜底「未知」）。 */
export function nodeKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? '未知';
}

export interface RingGroup {
  /** 协议 ring 值（只做 key）。 */
  ring: string;
  /** 展示名。 */
  label: string;
  nodes: MapNodeView[];
}

/**
 * 按 `ring` 分组：已知环层按 `RING_ORDER` 固定顺序在前，未知环层按出现顺序附后。
 * 组内保持服务端下发顺序（服务端已按 `orderIndex` 排序）。
 */
export function groupNodesByRing(nodes: readonly MapNodeView[]): RingGroup[] {
  const buckets = new Map<string, MapNodeView[]>();
  for (const node of nodes) {
    const bucket = buckets.get(node.ring);
    if (bucket === undefined) buckets.set(node.ring, [node]);
    else bucket.push(node);
  }

  const groups: RingGroup[] = [];
  const push = (ring: string): void => {
    const bucket = buckets.get(ring);
    if (bucket === undefined || bucket.length === 0) return;
    groups.push({ ring, label: ringLabel(ring), nodes: bucket });
    buckets.delete(ring);
  };

  for (const ring of RING_ORDER) push(ring);
  for (const ring of buckets.keys()) push(ring);
  return groups;
}

/**
 * 战力是否达标：**恰好等于门槛视为通过**（`settings-revision-2.md` §6.1 是 `≥`）。
 * 非有限数（NaN / ±Infinity）一律判不达标；`threshold <= 0` 视为无门槛，恒达标。
 */
export function isPowerEnough(playerPower: number, threshold: number): boolean {
  if (!Number.isFinite(playerPower) || !Number.isFinite(threshold)) return false;
  if (threshold <= 0) return true;
  return playerPower >= threshold;
}

/** 还差多少战力；达标或无门槛时为 0（非有限数也给 0，避免 `NaN` 上屏）。 */
export function powerShortfall(playerPower: number, threshold: number): number {
  if (!Number.isFinite(playerPower) || !Number.isFinite(threshold)) return 0;
  return Math.max(0, threshold - playerPower);
}

/**
 * 该节点是否可离线挂机的**候选节点**：只有 `kind === 'secret_realm'` 的秘境节点会
 * 在击败首个 Boss 后置 `progress.idleUnlocked`；跑图 / 主峰节点永远不是挂机点。
 */
export function isSecretRealm(node: MapNodeView): boolean {
  return node.kind === 'secret_realm';
}

/**
 * 邻接节点 code：双向边对称，单向边只认 `from → to`。
 * **必须过滤未下发的节点**（悬挂边）与自环，否则线路图会显示不存在的邻接。
 */
export function neighborCodes(
  nodeCode: string,
  edges: readonly MapEdgeView[],
  visibleCodes: ReadonlySet<string>,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    let other: string | null = null;
    if (edge.fromNodeCode === nodeCode) other = edge.toNodeCode;
    else if (edge.bidirectional && edge.toNodeCode === nodeCode) other = edge.fromNodeCode;
    if (other === null || other === nodeCode) continue;
    if (!visibleCodes.has(other) || seen.has(other)) continue;
    seen.add(other);
    result.push(other);
  }
  return result;
}

/** 邻接节点的展示名（找不到名字的悬挂引用直接丢弃，绝不上屏 code 原文）。 */
export function neighborNames(
  nodeCode: string,
  edges: readonly MapEdgeView[],
  visible: ReadonlyMap<string, MapNodeView>,
): string[] {
  return neighborCodes(nodeCode, edges, new Set(visible.keys())).flatMap((code) => {
    const neighbor = visible.get(code);
    return neighbor === undefined ? [] : [neighbor.name];
  });
}

/** 是否可传送到该节点：有传送点 + 已点亮 + 不是当前所在。 */
export function canUseWaypoint(node: MapNodeView, currentCode: string | null): boolean {
  return node.hasWaypoint && node.progress.waypointUnlocked && node.code !== currentCode;
}

/** 节点动作文案：秘境强调「秘境」（唯一的挂机入口），其余是跑图/主峰。 */
export function enterActionLabel(node: MapNodeView): string {
  if (isSecretRealm(node)) return '前往秘境';
  return '前往';
}

/** 「我的战力 vs 门槛」的补充说明：达标时为空串（StatCompare 已给结论）。 */
export function thresholdHint(playerPower: number, threshold: number): string {
  if (isPowerEnough(playerPower, threshold)) return '';
  return `战力不足：还差 ${powerShortfall(playerPower, threshold)}`;
}

/** 承载系统一句话文案（协议 key 原文不上屏；未知 key 走兜底名）。 */
export function featureTextOf(featureKey: string | null): string {
  if (featureKey === null) return '纯跑图';
  const label = featureLabelOf(featureKey) ?? '此地系统';
  return featureIsImplemented(featureKey) ? `${label}（已开放）` : `${label}（未开放）`;
}
