/**
 * 物品域共享类型与常量
 */

/** 稀有度：0凡 1灵 2宝 3传奇 */
export const RARITY_NAMES = ['凡品', '灵品', '宝品', '传奇'] as const;

/** 装备槽位 key（含双戒指） */
export const EQUIP_SLOT_KEYS = [
  'weapon',
  'body',
  'helmet',
  'gloves',
  'boots',
  'shield',
  'ring1',
  'ring2',
  'amulet',
  'belt',
] as const;

export type EquipSlotKey = (typeof EQUIP_SLOT_KEYS)[number];

/** 物品槽位 → 装备槽位映射（ring 特殊处理：ring1/ring2） */
export const ITEM_SLOT_BASE = {
  weapon: 'weapon',
  body: 'body',
  helmet: 'helmet',
  gloves: 'gloves',
  boots: 'boots',
  shield: 'shield',
  ring: 'ring',
  amulet: 'amulet',
  belt: 'belt',
} as const;

/** 效果键 → 中文展示名 */
export const EFFECT_LABELS: Record<string, string> = {
  atk: '攻击',
  def: '防御',
  hp: '生命',
  spirit_power: '灵力',
  atk_speed: '攻速',
  hp_regen: '生命回复',
  lingyun_gain: '灵韵获取',
  spirit_power_pct: '灵力加成',
  move_speed: '移速',
  focus: '神识',
  crit: '暴击',
  all_stats: '全属性',
  atk_pct: '攻击加成',
  atk_speed_pct: '攻速加成',
  all_stats_pct: '全属性加成',
  vs_demon_pct: '对魔修增伤',
};

/** 百分比类效果键 */
export const PERCENT_KEYS = new Set([
  'crit',
  'spirit_power_pct',
  'atk_pct',
  'atk_speed_pct',
  'all_stats_pct',
  'vs_demon_pct',
]);

/** 词缀极性 */
export type AffixPolarity = 'prefix' | 'suffix' | 'base';

/** 物品上固化的词缀条目（存储于 game_items.affixes JSON 字符串） */
export interface AffixEntry {
  affixId: number;
  /** roll 出的数值；基底/固定词缀为 null（值直接取词缀定义 effects） */
  value: number | null;
  polarity: AffixPolarity;
  /** roll 来源效果键（如 atk）；基底/固定词缀为 null */
  key: string | null;
}

/** 词缀表行 */
export interface AffixRow {
  id: number;
  code: string;
  name: string;
  polarity: string;
  tier: number;
  effects: string; // JSON 字符串
  value_func: string | null; // JSON 字符串
  weight: number;
  is_fractured: boolean;
}

/** 物品基底表行 */
export interface BaseRow {
  id: number;
  code: string;
  name: string;
  category: string;
  slot: string | null;
  sub_type: string | null;
  tier: number;
  base_stats: string | null;
  implicit_affixes: string | null;
  unique_affixes: string | null;
  rarity_limit: number;
  drop_weight: number;
}

/** 物品实例表行 */
export interface ItemRow {
  id: string; // BIGINT → 字符串
  character_id: number | null;
  base_id: number;
  rarity: number;
  tier: number;
  quality: number;
  affixes: string | null;
  status: string;
  created_at: Date | string;
}

/** 对外物品摘要（含渲染文本） */
export interface ItemView {
  id: number;
  baseId: number;
  baseCode: string;
  name: string;
  category: string;
  slot: string | null;
  rarity: number;
  rarityName: string;
  tier: number;
  quality: number;
  status: string;
  affixTexts: string[];
  affixes: AffixEntry[];
  createdAt?: string | Date;
}

/** 业务错误结果（通过 success:false + data.code 表达） */
export interface FailResult {
  success: false;
  message: string;
  data: { code: string };
}
