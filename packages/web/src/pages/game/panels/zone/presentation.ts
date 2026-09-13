/**
 * 秘境面板的**展示判定**（纯函数，单独成文件便于单测）。
 *
 * 这里只做「把服务端给的值翻译成玩家看得懂的禁用原因」，**不含任何业务规则**：
 * 是否可挑战由服务端 `canChallenge` 决定，本函数只是在不可挑战时挑一句话。
 */
export interface ChallengeBlockInput {
  canChallenge: boolean;
  cleared: boolean;
  /** 玩家当前战力。 */
  power: number;
  /** 本层门槛。 */
  need: number;
}

/** 不可挑战时的原因文案；可挑战时返回空串。 */
export function challengeBlockReason(input: ChallengeBlockInput): string {
  const { canChallenge, cleared, power, need } = input;
  if (canChallenge) return '';
  if (cleared) return '该秘境已通关，等待后续内容开放';
  if (power < need) return `战力不足：还差 ${Math.max(0, need - power)}`;
  return '当前无法挑战';
}

/** 秘境卡片副标题：进度文案（协议字段 `progress.bestFloor` 可能缺失，退回 0）。 */
export function zoneFloorText(bestFloor: number | undefined, maxFloor: number): string {
  const best = typeof bestFloor === 'number' && Number.isFinite(bestFloor) ? bestFloor : 0;
  const max = Number.isFinite(maxFloor) ? maxFloor : 0;
  return `进度 ${best} / ${max} 层`;
}

/** 前置未满足时的说明文案（前置秘境名与所需层数都来自服务端）。 */
export function prevZoneHint(prevZone: string | null, requirePrevBestFloor: number, prevBestFloor: number): string {
  if (prevZone === null) return `需先推进前置秘境至第 ${requirePrevBestFloor} 层`;
  return `需先推进「${prevZone}」至第 ${requirePrevBestFloor} 层（当前最高 ${prevBestFloor} 层）`;
}
