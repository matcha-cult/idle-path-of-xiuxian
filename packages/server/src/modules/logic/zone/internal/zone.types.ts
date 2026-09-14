/**
 * 秘境域共享类型（§22 重做，2026-09-14 晚）
 *
 * 语义反转（相对 P5.1/P3.0）：
 * - 秘境按**境界**分档（1~13），与地图节点彻底解耦 —— 不再是节点的"宿主"；
 * - `realm` 是**数值档位与展示**，不是入场闸门（"全都可突破，进去送人头都行"）；
 * - 解锁 = 在线打满 3 层（`clears ≥ 1`）；挂机 = 已解锁 ∧ `idle_allowed`。
 */
export { type FailResult, fail } from '../../../../common/kernel/result.js';

/** §22：历练（免费·可挂机）/ 特殊（需道具·不可挂机）。 */
export type ZoneTierKind = 'training' | 'special';

export interface ZoneRow {
  id: number;
  code: string;
  name: string;
  order_index: number;
  unit_code: string;
  boss_code: string | null;
  base_power: number;
  power_step: number;
  max_floor: number;
  lingyun_bonus_per_floor: number;
  boss_every_floors: number;
  tier_bonus_every_floors: number;
  drop_bonus_every_floors: number;
  /** §22：该秘境对应第几境（1~13）。旧库里可能为 NULL（种子重灌前），不得静默回落成 0。 */
  realm: number | null;
  /** §22：`training` | `special`（旧库缺省 DEFAULT 'training'）。 */
  tier_kind: string;
  /** §22：special 的突破道具（本轮只留字段 + 展示，不消耗）。 */
  unlock_item_code: string | null;
  /** §22：能否离线挂机（training=true / special=false）。 */
  idle_allowed: boolean;
  // ===== 语义作废的旧列（§22 §5.1：物理删列排到 T10，此前保留在行结构里）=====
  chapter: number | null;
  min_realm: number | null;
  require_prev_best_floor: number;
}

export interface ZoneProgressRow {
  id: number;
  character_id: number;
  zone_id: number;
  floor: number;
  best_floor: number;
  cleared: boolean;
  /** §22：通关次数（重复挑战每打满一轮 +1）；「已解锁」的唯一权威证据。 */
  clears: number;
}

export interface ZoneStateRow {
  id: number;
  character_id: number;
  current_zone_id: number;
}

/** §22 挂机点：离线结算目标（与 `game_zone_state`="在线战斗所在"刻意分开）。 */
export interface ZoneIdleStateRow {
  id: number;
  character_id: number;
  zone_id: number;
}

export interface ZoneProgressView {
  floor: number;
  bestFloor: number;
  cleared: boolean;
  clears: number;
}

/**
 * §23 A3：挂机「整轮」中**单层**的结算参数（`zone.idlePlan` 的组成单元）。
 *
 * 每一层都带齐自己的遭遇单位与三项层深加成，idle 域**不重算任何公式** —— 直接把这些
 * 值透传给既有的 `combat.settleKills`，与 `zone.challenge` / 在线 tick 同一套口径。
 */
export interface ZoneIdleFloor {
  /** 层号（1 起） */
  floor: number;
  /** 该层遭遇单位（Boss 层取 `boss_code`，缺省回落 `unit_code`） */
  unitCode: string;
  isBoss: boolean;
  /** 该层门槛 = base_power + (floor-1) × power_step（仅展示 / 诊断用） */
  floorRequirement: number;
  /** 层灵韵加成 = floor × lingyun_bonus_per_floor（`settleKills` 每次调用加一次） */
  lingyunBonusFlat: number;
  tierOffsetBonus: number;
  /** 含 Boss 层额外判定（`zoneBossExtraDraws`） */
  dropDrawBonus: number;
}

/**
 * §23 A3：一次挂机「整轮」的逐层计划 —— **永远**包含 1..maxFloor 全部层。
 *
 * 与旧的 `idleEncounter`（只回 `min(progress.floor, maxFloor)`，已突破秘境恒为 Boss 层）
 * 的关键差别：挂机不再钉在最深层，而是按「循环整轮」把总击杀摊到每一层。
 */
export interface ZoneIdlePlan {
  zoneCode: string;
  zoneName: string;
  realm: number;
  maxFloor: number;
  /** 升序 1..maxFloor；长度 ≥ 1（max_floor 非法时收敛为 1） */
  floors: ZoneIdleFloor[];
}

export function progressOf(row: ZoneProgressRow | null): ZoneProgressView {
  if (!row) return { floor: 1, bestFloor: 0, cleared: false, clears: 0 };
  return {
    floor: Number(row.floor),
    bestFloor: Number(row.best_floor),
    cleared: Boolean(row.cleared),
    clears: Number(row.clears) || 0,
  };
}

/**
 * 「已突破 / 已解锁」的权威判定 = `clears ≥ 1`（不是 `cleared` 列）。
 *
 * 为什么不用 `cleared`：`startRun` 会把已突破秘境的 `floor` 重置回 1 开新一轮，
 * 此时 `cleared` 若被清掉就会丢失「已解锁」；`clears` 是**只增不减**的周目计数，
 * 天然表达「曾经打满过至少一轮」。
 */
export function isUnlocked(view: ZoneProgressView): boolean {
  return view.clears >= 1;
}

/** 秘境境界（1~14 合法；NULL / 越界 → 0 = 未知，供调用方显式失败，绝不静默参与数值）。 */
export function zoneRealm(zone: ZoneRow): number {
  const r = Number(zone.realm);
  return Number.isInteger(r) && r >= 1 && r <= 14 ? r : 0;
}

/** 秘境类别（DB 里是字符串，除 `special` 外一律按 `training` 处理 —— 白名单语义）。 */
export function zoneTierKind(zone: ZoneRow): ZoneTierKind {
  return zone.tier_kind === 'special' ? 'special' : 'training';
}

/** 突破准入（§22 §6.2）：不校验境界、不校验战力 —— 只问「要不要道具」。 */
export interface ZoneAccess {
  canBreakthrough: boolean;
  reason: 'ok' | 'item_required';
  /** 所需道具 code（`reason='item_required'` 时有值，仅展示 / 后期实装消耗）。 */
  itemCode: string | null;
}

/**
 * 突破准入的**唯一**判定。两种失败之外的都放行（用户原话「进去送人头都行」）。
 */
export function accessOf(zone: ZoneRow): ZoneAccess {
  if (zoneTierKind(zone) === 'special') {
    return { canBreakthrough: false, reason: 'item_required', itemCode: zone.unlock_item_code ?? null };
  }
  return { canBreakthrough: true, reason: 'ok', itemCode: null };
}

/**
 * 可挂机判定（§22 Q5 / §6.2）：已解锁 ∧ `idle_allowed`。
 * `idle_allowed` 失效时按 FALSE（安全侧：绝不允许"意外可挂机"）。
 */
export function idleEligible(zone: ZoneRow, view: ZoneProgressView): boolean {
  return isUnlocked(view) && zone.idle_allowed === true;
}

export function floorRequirement(zone: ZoneRow, floor: number): number {
  return Number(zone.base_power) + (floor - 1) * Number(zone.power_step);
}

export function isBossFloor(zone: ZoneRow, floor: number): boolean {
  return Boolean(zone.boss_code) && zone.boss_every_floors > 0 && floor % zone.boss_every_floors === 0;
}

/** 层深度阶数加成：每 tier_bonus_every_floors 层 tierOffset +1（0=禁用） */
export function tierOffsetBonusFor(zone: ZoneRow, floor: number): number {
  return zone.tier_bonus_every_floors > 0 ? Math.floor((floor - 1) / zone.tier_bonus_every_floors) : 0;
}

/** 层深度掉落加成：每 drop_bonus_every_floors 层 +1 次判定（0=禁用） */
export function dropDrawBonusFor(zone: ZoneRow, floor: number): number {
  return zone.drop_bonus_every_floors > 0 ? Math.floor((floor - 1) / zone.drop_bonus_every_floors) : 0;
}

/**
 * 在线历练上下文（P3.0 T4 保留，§22 加 `clears`）：把「打一层」需要的既有派生量一次性打包。
 *
 * 目的：在线 tick **不重写任何公式** —— 门槛走 {@link floorRequirement}、Boss 层走
 * {@link isBossFloor}、掉落深度走 {@link tierOffsetBonusFor} / {@link dropDrawBonusFor}，
 * 与 `zone.challenge` 用的是同一组函数。
 */
export interface ZoneOnlineContext {
  /** `game_zones.id`（层推进落库用，与 `challenge` 同一列） */
  zoneId: number;
  zoneCode: string;
  zoneName: string;
  /** §22：秘境对应境界（帧里显示「第 N 境秘境」用；未知为 0） */
  realm: number;
  maxFloor: number;
  floor: number;
  bestFloor: number;
  cleared: boolean;
  /** §22：周目计数（「本轮是不是首个周目」由此判断 exhaust unlock 事件） */
  clears: number;
  playerPower: number;
  /** 本层门槛 = base_power + (floor-1) × power_step（既有公式） */
  floorRequirement: number;
  isBossFloor: boolean;
  /** 本层遭遇单位（Boss 层取 boss_code，缺省回落 unit_code） */
  unitCode: string;
  /** 层灵韵加成 = floor × lingyun_bonus_per_floor（既有口径） */
  lingyunBonusFlat: number;
  tierOffsetBonus: number;
  dropDrawBonus: number;
}