/**
 * 秘境域共享类型（P5.1）
 */
import { type FailResult, fail } from '../unit/unit.types.js';

export { fail };
export type { FailResult };

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
