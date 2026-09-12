/**
 * 单位域共享类型与常量（P4 单位系统）
 */

export { type FailResult, fail } from '../../../common/kernel/result.js';

/** 单位阵营 */
export const UNIT_CAMPS = ['hostile', 'neutral', 'friendly'] as const;
export type UnitCamp = (typeof UNIT_CAMPS)[number];

/** 掉落条目类型 */
export const DROP_KINDS = ['base', 'currency', 'essence'] as const;
export type DropKind = (typeof DROP_KINDS)[number];

/** 辨宝法阵动作 */
export const LOOT_ACTIONS = ['keep', 'salvage', 'sell', 'discard'] as const;
export type LootAction = (typeof LOOT_ACTIONS)[number];

export function normalizeLootAction(value: unknown): LootAction {
  return value === 'salvage' || value === 'sell' || value === 'discard' ? value : 'keep';
}

export interface UnitTemplateRow {
  id: number;
  code: string;
  name: string;
  realm: number;
  camp: string;
  gives_lingyun: boolean;
  base_stats: string | null;
  drop_table_ref: number | null;
}

export interface HiddenAffixRow {
  id: number;
  code: string;
  name: string;
  effects: string;
  weight: number;
}

export interface DropTableRow {
  id: number;
  code: string;
  name: string;
  drops_per_kill: number;
  tier_offset: number;
}

export interface DropEntryRow {
  id: number;
  drop_table_id: number;
  kind: string;
  base_id: number | null;
  base_tier: number | null;
  rarity: number | null;
  currency_code: string | null;
  essence_code: string | null;
  min_count: number;
  max_count: number;
  weight: number;
}

export interface PickupRuleRow {
  id: number;
  character_id: number;
  name: string;
  rarity_min: number;
  tier_min: number;
  affix_codes: string | null;
  action: string;
  enabled: boolean;
  priority: number;
}

export interface HiddenAffixView {
  code: string;
  name: string;
  effects: Record<string, number>;
}

export interface UnitInstanceView {
  code: string;
  name: string;
  realm: number;
  realmName: string;
  camp: string;
  givesLingyun: boolean;
  dropTable: string | null;
  baseStats: Record<string, number>;
  hiddenAffixes: HiddenAffixView[];
  finalStats: Record<string, number>;
  lingyunReward: number;
}
