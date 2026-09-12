/**
 * 通货域共享类型与常量
 */
export interface CurrencyRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  implemented: boolean;
}

export interface WalletRow {
  id: number;
  character_id: number;
  currency_code: string;
  amount: string; // BIGINT → 字符串
}

export const CRAFT_OPS = [
  'transmute', 'alchemy', 'chaos', 'exalt', 'annul', 'scour', 'divine',
  'blessed', 'mirror', 'vaal', 'fracture', 'ember', 'wisp', 'essence',
] as const;
export type CraftOp = (typeof CRAFT_OPS)[number];

export { type FailResult, fail } from '../../../../common/kernel/result.js';
