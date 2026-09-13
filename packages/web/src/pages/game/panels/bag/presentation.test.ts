/**
 * 背包展示纯函数单测：筛选（空数组 / 非有限数 / 区间反转）、门槛判定（已装备 / 超阶 / NaN）、
 * 槽位匹配（双戒指优先级 / null）、词条映射（affixId 只做 key）。
 */
import { describe, expect, it } from 'vitest';
import type { AffixView, ItemView } from '@idle-path/ionet-transport';
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  discardBlockReason,
  equipBlockReason,
  filterBagItems,
  statusLabel,
  toAffixEntries,
  wornForSlot,
} from './presentation.js';

function makeItem(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 1,
    baseId: 1,
    baseCode: 'sword_1',
    name: '青锋剑',
    category: 'weapon',
    slot: 'weapon',
    rarity: 1,
    rarityName: '灵品',
    tier: 3,
    quality: 0,
    status: 'bag',
    affixTexts: [],
    affixes: [],
    ...overrides,
  };
}

const NO_FILTERS = { rarity: null, category: null, tierMin: null, tierMax: null };

describe('filterBagItems', () => {
  const items = [
    makeItem({ id: 1, rarity: 1, category: 'weapon', tier: 3 }),
    makeItem({ id: 2, rarity: 2, category: 'body', tier: 8 }),
  ];

  it('空数组与无筛选条件原样返回', () => {
    expect(filterBagItems([], NO_FILTERS)).toEqual([]);
    expect(filterBagItems(items, NO_FILTERS)).toHaveLength(2);
  });

  it('按稀有度 / 品类 / T 阶区间筛选', () => {
    expect(filterBagItems(items, { ...NO_FILTERS, rarity: 2 }).map((i) => i.id)).toEqual([2]);
    expect(filterBagItems(items, { ...NO_FILTERS, category: 'weapon' }).map((i) => i.id)).toEqual([1]);
    expect(filterBagItems(items, { ...NO_FILTERS, tierMin: 5 }).map((i) => i.id)).toEqual([2]);
    expect(filterBagItems(items, { ...NO_FILTERS, tierMax: 5 }).map((i) => i.id)).toEqual([1]);
  });

  it('边界：NaN / Infinity 视为不筛，区间反转时交集为空', () => {
    expect(filterBagItems(items, { ...NO_FILTERS, tierMin: Number.NaN, tierMax: Number.POSITIVE_INFINITY })).toHaveLength(2);
    expect(filterBagItems(items, { ...NO_FILTERS, rarity: Number.NaN })).toHaveLength(2);
    expect(filterBagItems(items, { ...NO_FILTERS, tierMin: 9, tierMax: 1 })).toEqual([]);
  });
});

describe('门槛与状态文案', () => {
  it('装备原因：已装备 / 超阶 / 境界非有限数', () => {
    expect(equipBlockReason(makeItem({ tier: 3 }), 5)).toBe('');
    expect(equipBlockReason(makeItem({ status: 'equipped' }), 5)).toBe('已装备');
    expect(equipBlockReason(makeItem({ status: 'crafted' }), 5)).toBe('当前状态不可装备');
    expect(equipBlockReason(makeItem({ tier: 9 }), 2)).toContain('需 T9');
    expect(equipBlockReason(makeItem({ tier: 9 }), Number.NaN)).toContain('境界不足');
    expect(equipBlockReason(makeItem({ tier: Number.NaN }), 5)).toBe('阶数数据缺失');
  });

  it('丢弃原因与状态中文映射', () => {
    expect(discardBlockReason(makeItem())).toBe('');
    expect(discardBlockReason(makeItem({ status: 'equipped' }))).toBe('仅背包中的物品可丢弃');
    expect(statusLabel('bag')).toBe('在背包');
    expect(statusLabel('equipped')).toBe('已装备');
    expect(statusLabel('mystery')).toBe('不可用');
  });

  it('品类中文映射：未知 code 不回流原文', () => {
    expect(categoryLabel('weapon')).toBe('武器');
    expect(categoryLabel('unknown_thing')).toBe('其它');
    expect(CATEGORY_OPTIONS.length).toBeGreaterThan(0);
  });
});

describe('wornForSlot / toAffixEntries', () => {
  const ring1 = { id: 1, name: '甲戒', rarity: 1, tier: 2 };
  const ring2 = { id: 2, name: '乙戒', rarity: 1, tier: 3 };

  it('双戒指优先 ring1，其次 ring2；空槽与不可穿戴返回 null', () => {
    expect(wornForSlot('ring', { ring1, ring2 })?.name).toBe('甲戒');
    expect(wornForSlot('ring', { ring1: null, ring2 })?.name).toBe('乙戒');
    expect(wornForSlot('ring', {})).toBeNull();
    expect(wornForSlot(null, { weapon: ring1 })).toBeNull();
    expect(wornForSlot('weapon', { weapon: ring1 })?.name).toBe('甲戒');
  });

  it('词条映射：affixId 只做 key，fractured 缺省为 false，value=null 保留', () => {
    const affix: AffixView = {
      affixId: 7,
      value: null,
      polarity: 'base',
      key: null,
      code: 'aff_base',
      name: '锋锐',
      tier: 0,
    };
    const [entry] = toAffixEntries([affix]);
    expect(entry?.name).toBe('锋锐');
    expect(entry?.tier).toBe(0);
    expect(entry?.value).toBeNull();
    expect(entry?.fractured).toBe(false);
    expect(entry?.key).toContain('7');
    expect(JSON.stringify(entry)).not.toContain('aff_base');
  });
});
