/**
 * 在线探索节奏（P3.0 §3.1 / R2 §4.2）—— **本轮全部新数字集中在这里**。
 *
 * 为什么单独一个文件：这些值是**玩法调参**，不是业务规则。想让历练更快/更慢、
 * 推送更密/更疏，只改这个对象即可，不必翻服务代码；公式（碾压比、夹取、涨层）
 * 则放在下方纯函数里，与数值分离以便单测。
 *
 * ⚠️ 客户端**不参与**这些数字的推算（R2 §4.2「明确不做」：不本地涨层、不本地算产出）。
 */
export const ONLINE_TICK = {
  /**
   * 结算节拍（ms）。取 1000：
   * - 与既有 `connection.refreshMetrics()` 的 1s 轮询同拍，玩家看到的「击杀数在涨」与
   *   延迟数字同频，不会一个 100ms 一个 1s 地互相打脸；
   * - 1s 粒度下 `killsPerSecondBase = 1` 恰好是「每秒 1 只」，数值好读、好调。
   */
  tickMs: 1000,
  /**
   * 推送节流（ms）。取 3000：10 秒内最多 `ceil(10000/3000) = 4` 帧，
   * 既能让「击杀在涨」有实时感，又不会每 tick 一条通知刷屏（帧是**合并摘要**）。
   */
  pushEveryMs: 3000,
  /** 碾压比 `r = 1` 时每秒击杀数（其余按 r 线性缩放）。 */
  killsPerSecondBase: 1,
  /**
   * 碾压比夹取区间 `[下界, 上界]`：
   * - 下界 0.5：战力只有门槛一半也**照样能磨**（2 秒 1 只），只是慢 —— 避免「卡层 = 完全停摆」；
   * - 上界 4：防止高战力把单 tick 击杀数顶爆（还有 `idleKillsPerSecCeiling` 兜底）。
   */
  ratioClamp: [0.5, 4] as readonly [number, number],
  /** 普通层涨层所需击杀数（30）。 */
  killsPerFloor: 30,
  /**
   * 单 tick 击杀上限（防爆）。取 20 = 上界速率（4）× 基础（1）× 5 秒的余量，
   * 用来兜住「tick 被阻塞后一次性补算」或 `tickMs` 被调大时的巨量结算。
   */
  idleKillsPerSecCeiling: 20,
} as const;

/**
 * 击杀速率（只/秒）= `clamp(r, 下界, 上界) × killsPerSecondBase`。
 *
 * 边界：`r` 非有限数（NaN / ±Infinity）或门槛为 0 → 取下界（保守，绝不放大产出）；
 * `r ≤ 0` 同样落下界。
 */
export function killRatePerSecond(r: number): number {
  const [lo, hi] = ONLINE_TICK.ratioClamp;
  if (!Number.isFinite(r)) return lo * ONLINE_TICK.killsPerSecondBase;
  const clamped = Math.min(Math.max(r, lo), hi);
  return clamped * ONLINE_TICK.killsPerSecondBase;
}

/** 碾压比 `r = 战力 / 本层门槛`；门槛 ≤ 0 / 非有限 → `NaN`（交由 `killRatePerSecond` 落下界）。 */
export function powerRatio(playerPower: number, floorRequirement: number): number {
  if (!Number.isFinite(playerPower) || !Number.isFinite(floorRequirement)) return Number.NaN;
  if (floorRequirement <= 0) return Number.NaN;
  return playerPower / floorRequirement;
}

/**
 * 本 tick 的击杀数与**小数进位**。
 *
 * 为什么带进位：`r = 1.33` 时每 tick 只有 1.33 只，取整会永远丢掉 0.33，
 * 于是「战力高 33% 」变成「和高战力没差」。进位保留小数，10 tick 后正好累计 13 只。
 *
 * 边界：
 * - `kills` 被 `idleKillsPerSecCeiling` 截断（防爆）；
 * - 进位**只保留 1 以内的小数**（`carry = raw - floor(raw)`），被上限截掉的部分直接丢弃，
 *   不会攒成一笔「补算」——否则一次卡顿会变成离线补算的等效物。
 * - `tickMs`/`rate` 非法（NaN / 负数）→ 0 击杀、进位保持（不产生负产出）。
 */
export function killsForTick(
  ratePerSecond: number,
  tickMs: number,
  carry: number,
  ceiling: number = ONLINE_TICK.idleKillsPerSecCeiling,
): { kills: number; carry: number } {
  const safeCarry = Number.isFinite(carry) && carry > 0 ? carry : 0;
  if (!Number.isFinite(ratePerSecond) || ratePerSecond < 0 || !Number.isFinite(tickMs) || tickMs <= 0) {
    return { kills: 0, carry: safeCarry };
  }
  const raw = ratePerSecond * (tickMs / 1000) + safeCarry;
  if (!Number.isFinite(raw) || raw <= 0) return { kills: 0, carry: safeCarry };
  const floored = Math.floor(raw);
  const capped = Math.min(floored, Math.max(0, Math.floor(ceiling)));
  return { kills: capped, carry: raw - floored };
}
