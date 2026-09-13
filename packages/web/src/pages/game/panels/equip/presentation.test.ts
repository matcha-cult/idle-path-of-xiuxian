/**
 * 装备展示纯函数单测：槽位映射（含双戒指）、候选筛选（排除已装备/异部位）、
 * 阶数门槛（超阶 / 非有限数）、境界名（越界）。
 */
import { describe, expect, it } from 'vitest';
import { REALMS, type ItemView } from '@idle-path/ionet-transport';
import {
  SLOT_KEYS,
  baseSlotOf,
  candidatesForSlot,
  realmLabel,
  slotLabel,
  tierGateReason,
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

describe('槽位映射', () => {
  it('十个槽位都有中文名，未知 key 不回显原文', () => {
    expect(SLOT_KEYS).toHaveLength(10);
    for (const key of SLOT_KEYS) expect(slotLabel(key)).not.toBe(key);
    expect(slotLabel('weapon')).toBe('武器');
    expect(slotLabel('ring1')).toBe('戒指一');
    expect(slotLabel('ring2')).toBe('戒指二');
    expect(slotLabel('mystery')).toBe('未知部位');
  });

  it('双戒指映射回物品基底 slot `ring`，其余原样', () => {
    expect(baseSlotOf('ring1')).toBe('ring');
    expect(baseSlotOf('ring2')).toBe('ring');
    expect(baseSlotOf('weapon')).toBe('weapon');
  });
});

describe('candidatesForSlot', () => {
  const items = [
    makeItem({ id: 1, slot: 'ring' }),
    makeItem({ id: 2, slot: 'ring', status: 'equipped' }),
    makeItem({ id: 3, slot: 'body', category: 'body' }),
  ];

  it('双戒指槽位匹配同部位且未装备的物品', () => {
    expect(candidatesForSlot(items, 'ring1').map((i) => i.id)).toEqual([1]);
    expect(candidatesForSlot(items, 'ring2').map((i) => i.id)).toEqual([1]);
  });

  it('异部位不入选；空数组返回空数组', () => {
    expect(candidatesForSlot(items, 'weapon')).toEqual([]);
    expect(candidatesForSlot([], 'weapon')).toEqual([]);
  });
});

describe('门槛与境界名', () => {
  it('tierGateReason：可穿为空串，超阶给出「需 T{n}（当前 T{m}）」', () => {
    expect(tierGateReason(3, 5)).toBe('');
    expect(tierGateReason(5, 5)).toBe('');
    expect(tierGateReason(9, 2)).toBe('境界不足：需 T9（当前 T2）');
    expect(tierGateReason(9, Number.NaN)).toBe('境界不足：需 T9');
    expect(tierGateReason(Number.NaN, 5)).toContain('阶数数据缺失');
  });

  it('realmLabel：1/14 正常，0/越界/非有限数给占位', () => {
    expect(realmLabel(1)).toBe(REALMS[0]);
    expect(realmLabel(REALMS.length)).toBe(REALMS[REALMS.length - 1]);
    expect(realmLabel(0)).toBe('未知');
    expect(realmLabel(REALMS.length + 1)).toBe('未知');
    expect(realmLabel(Number.NaN)).toBe('未知');
  });
});
