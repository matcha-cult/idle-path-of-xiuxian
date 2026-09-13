/**
 * 地点详情的数据分层（T1，2026-09-14 用户判定）。
 *
 * 用户原话：「宗门内总不能天天杀同门吧，所以宗门内地点详情中显示『怪物境界 第 4 境
 * 难度参考门槛 65』真是有点搞笑来着。」
 *
 * 因此：`level` / `threshold` 只有 `kind === 'secret_realm'` 的秘境节点才有值，
 * 其余 16 个职能型枢纽下发 `null`。本文件把「按 `level === null` 分流」这条规则抽成
 * **纯函数**（可单测，且组件里不内联映射表）：
 * - 有战斗数据 → 显示「怪物境界 / 难度参考门槛 + 中性战力对比」；
 * - 职能型枢纽 → **完全不显示任何战斗数据**，改为提示「此地无怪物」+ 下方职能入口。
 *
 * ⚠️ 禁止把 `null` 回落成 `0`（`Number(null) === 0`）—— 那会把「没有怪物」静默变成
 * 「怪物境界 0 / 门槛 0」，正是本条要修的荒诞。
 */
import type { MapNodeView } from '@idle-path/ionet-transport';
import { featureTextOf, nodeKindLabel } from './presentation.js';

/** 属性明细条目（结构上兼容 ui-kit 的 `KeyValueEntry`，但本文件不依赖 ui-kit）。 */
export interface NodeDetailEntry {
  key: string;
  label: string;
  value: string | number;
  span?: number;
}

/** 该节点是否带战斗数据（= 秘境节点）。**分流只看 `level`**，不看 `kind` 原文。 */
export function isCombatNode(node: Pick<MapNodeView, 'level'>): boolean {
  return node.level !== null;
}

/**
 * 有战斗数据时的属性明细；职能型枢纽**一条战斗数据都不带**。
 *
 * `threshold` 缺失（配置漂移）时显示「未知」，不回落成 0 —— 让配置错误可见。
 */
export function nodeDetailEntries(
  node: MapNodeView,
  playerPower: number,
): NodeDetailEntry[] {
  const entries: NodeDetailEntry[] = [];
  if (isCombatNode(node)) {
    entries.push({ key: 'level', label: '怪物境界', value: `第 ${node.level} 境` });
    entries.push({
      key: 'threshold',
      label: '难度参考门槛',
      value: node.threshold === null ? '未知' : node.threshold,
    });
  }
  entries.push({ key: 'power', label: '我的战力', value: playerPower });
  entries.push({ key: 'kind', label: '节点类型', value: nodeKindLabel(node.kind) });
  entries.push({ key: 'system', label: '承载系统', value: featureTextOf(node.featureKey), span: 2 });
  return entries;
}

/**
 * 中性战力对比文案（`threshold` 只是参考，不做红绿判定、不喊「不足」）。
 *
 * 职能型枢纽或门槛缺失 → `null`（调用方**不渲染**这一行），绝不会产出
 * `参考战力 null` 这种半截文案。
 */
export function nodeCompareText(
  node: Pick<MapNodeView, 'level' | 'threshold'>,
  playerPower: number,
): string | null {
  if (!isCombatNode(node) || node.threshold === null) return null;
  return `参考战力 ${node.threshold} · 我的战力 ${playerPower}`;
}

/** 职能型枢纽的说明句；有战斗数据的节点返回 `null`。 */
export function hubNoteOf(node: Pick<MapNodeView, 'level'>): string | null {
  if (isCombatNode(node)) return null;
  return '职能枢纽：此地无怪物，可做的事见下方职能入口';
}

/** 右栏小标题的后半段（战斗数据的出现与否要与卡片内容一致）。 */
export function detailSubtitleTail(node: Pick<MapNodeView, 'level'>): string {
  return isCombatNode(node) ? '难度参考 / 传送点 / 职能入口' : '传送点 / 职能入口';
}
