/**
 * 秘境面板的**展示判定**（纯函数，单独成文件便于单测）。
 *
 * 这里只做「把服务端给的值翻译成玩家看得懂的话」，**不含任何业务规则**：
 * §22 起秘境页面只列**已突破**的秘境（服务端就不下发未突破的），因此这里不再有
 * 「为什么进不去」的锁判定；能不能挂机、能不能突破也全由服务端字段表达。
 */
import type { ZoneBreakthroughView, ZoneTierKind, ZoneView } from '@idle-path/ionet-transport';

/** 秘境类别中文名（协议 key 原文不上屏）。 */
export function zoneTierLabel(tierKind: ZoneTierKind): string {
  return tierKind === 'special' ? '特殊秘境' : '历练秘境';
}

/** 秘境卡片副标题：进度文案（协议字段 `progress.bestFloor` 可能缺失，退回 0）。 */
export function zoneFloorText(bestFloor: number | undefined, maxFloor: number): string {
  const best = typeof bestFloor === 'number' && Number.isFinite(bestFloor) ? bestFloor : 0;
  const max = Number.isFinite(maxFloor) ? maxFloor : 0;
  return `进度 ${best} / ${max} 层`;
}

/** 通关轮数文案（§22：可重复挑战，每打满一轮 +1；非法值退回 0）。 */
export function zoneClearsText(clears: number | undefined): string {
  const n = typeof clears === 'number' && Number.isFinite(clears) && clears > 0 ? Math.floor(clears) : 0;
  return n <= 0 ? '尚未打满一轮' : `已通关 ${n} 轮`;
}

/** 挂机点选择器的一项（§23）。 */
export interface IdleTargetOption {
  code: string;
  name: string;
  /** 该秘境对应第几境（展示用，不是准入闸门） */
  realm: number;
  /** 一行副文案（进度 / 通关轮数） */
  detail: string;
}

/**
 * §23：从**已突破秘境**列表里筛出**可挂机**的那些，做成选择器选项。
 *
 * 服务端已保证 `zones` 只含已突破秘境，但「已突破」不等于「可挂机」——
 * 特殊秘境（6~13 境）`idleAllowed=false`，服务端会以 `ZONE_NOT_IDLE_ELIGIBLE` 拒绝，
 * 所以这里**提前筛掉**，前端不给必败的入口（G5）。
 */
export function idleTargetOptions(zones: readonly ZoneView[]): IdleTargetOption[] {
  return zones
    .filter((entry) => entry.idleAllowed)
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      realm: entry.realm,
      detail: `${zoneFloorText(entry.progress?.bestFloor, entry.maxFloor)} · ${zoneClearsText(entry.progress?.clears)}`,
    }));
}

/**
 * §23：当前挂机点的中文名。
 *
 * 优先查已突破列表；查不到再退到突破名录（挂机点仍是已突破秘境，这里只是容错：
 * 例如 `zones` 尚未刷新完，或该秘境被后续配置改成不可挂机）。
 */
export function idleTargetName(
  target: string | null,
  zones: readonly ZoneView[],
  breakthrough: readonly ZoneBreakthroughView[],
): string | null {
  if (target === null || target === '') return null;
  const inCatalog = zones.find((entry) => entry.code === target);
  if (inCatalog !== undefined) return inCatalog.name;
  return breakthrough.find((entry) => entry.code === target)?.name ?? null;
}