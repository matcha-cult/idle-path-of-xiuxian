/**
 * 秘境面板的**展示判定**（纯函数，单独成文件便于单测）。
 *
 * 这里只做「把服务端给的值翻译成玩家看得懂的话」，**不含任何业务规则**：
 * §22 起秘境页面只列**已突破**的秘境（服务端就不下发未突破的），因此这里不再有
 * 「为什么进不去」的锁判定；能不能挂机、能不能突破也全由服务端字段表达。
 */
import type { ZoneTierKind } from '@idle-path/ionet-transport';

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