/**
 * 秘境域共享类型（P5.1）
 */
export { type FailResult, fail } from '../../../../common/kernel/result.js';

export interface ZoneRow {
  id: number;
  code: string;
  name: string;
  chapter: number;
  order_index: number;
  min_realm: number;
  unit_code: string;
  boss_code: string | null;
  base_power: number;
  power_step: number;
  max_floor: number;
  lingyun_bonus_per_floor: number;
  boss_every_floors: number;
  require_prev_best_floor: number;
  tier_bonus_every_floors: number;
  drop_bonus_every_floors: number;
}

export interface ZoneProgressRow {
  id: number;
  character_id: number;
  zone_id: number;
  floor: number;
  best_floor: number;
  cleared: boolean;
}

export interface ZoneStateRow {
  id: number;
  character_id: number;
  current_zone_id: number;
}

export interface ZoneProgressView {
  floor: number;
  bestFloor: number;
  cleared: boolean;
}

export function progressOf(row: ZoneProgressRow | null): ZoneProgressView {
  if (!row) return { floor: 1, bestFloor: 0, cleared: false };
  return { floor: Number(row.floor), bestFloor: Number(row.best_floor), cleared: Boolean(row.cleared) };
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
 * 在线历练上下文（P3.0 T4）：把「打一层」需要的既有派生量一次性打包。
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
  maxFloor: number;
  floor: number;
  bestFloor: number;
  cleared: boolean;
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
