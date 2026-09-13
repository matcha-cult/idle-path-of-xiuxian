/** 炼器展示映射测试：标签 / 角标 / 词缀映射 / 选物筛选 / 注入解析 / 边界。 */
import { describe, expect, it } from 'vitest';
import { CRAFT_OPS, RARITY_NAMES } from '@idle-path/ionet-transport';
import type { CurrencyView, EssenceView, ItemView } from '@idle-path/ionet-transport';
import {
  DESTRUCTIVE_OPS,
  affixEntries,
  filterItems,
  hasDropSource,
  injectOptions,
  injectTarget,
  injectTargetName,
  opLabel,
  outcomeLabel,
  rarityOptions,
} from './presentation.js';

function makeItem(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 33,
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

function makeCurrency(overrides: Partial<CurrencyView> = {}): CurrencyView {
  return { id: 1, code: 'chaos', name: '混沌石', description: '重 roll', implemented: true, owned: 3, ...overrides };
}

function makeEssence(overrides: Partial<EssenceView> = {}): EssenceView {
  return {
    id: 1,
    code: 'ess_atk',
    name: '锋锐精华',
    polarity: 'prefix',
    targetFamily: 'aff_atk',
    description: '定向：前缀必出锋锐族',
    owned: 2,
    ...overrides,
  };
}

describe('economy/presentation · 标签与角标', () => {
  it('opLabel 覆盖全部 CRAFT_OPS，未知值不泄露原文', () => {
    for (const op of CRAFT_OPS) expect(opLabel(op)).not.toBe('未知工艺');
    expect(opLabel('weird')).toBe('未知工艺');
  });

  it('hasDropSource：只有 5 种通货有掉落来源，其余 8 种如实标注', () => {
    const withDrop = ['chaos', 'alchemy', 'exalt', 'divine', 'transmute'];
    for (const code of withDrop) expect(hasDropSource(code)).toBe(true);
    for (const code of ['annul', 'scour', 'blessed', 'mirror', 'vaal', 'fracture', 'ember', 'wisp']) {
      expect(hasDropSource(code)).toBe(false);
    }
  });

  it('DESTRUCTIVE_OPS 只含需要二次确认的危险操作', () => {
    expect([...DESTRUCTIVE_OPS].sort()).toEqual(['mirror', 'scour', 'vaal']);
  });

  it('rarityOptions 名称来自协议常量', () => {
    expect(rarityOptions()).toEqual(RARITY_NAMES.map((name, index) => ({ label: name, value: index })));
  });
});

describe('economy/presentation · 词缀与结果映射', () => {
  it('affixEntries 保留 tier/polarity/value，fractured 缺省为 false', () => {
    const entries = affixEntries([
      { affixId: 5, value: 12, polarity: 'prefix', key: 'k', code: 'aff_a', name: '锋锐', tier: 2 },
      { affixId: 6, value: null, polarity: 'base', key: null, code: 'base_a', name: '锋芒', tier: 0, fractured: true },
    ]);
    expect(entries[0]).toMatchObject({ name: '锋锐', tier: 2, polarity: 'prefix', value: 12, fractured: false });
    expect(entries[1]).toMatchObject({ name: '锋芒', tier: 0, value: null, fractured: true });
    expect(entries.map((entry) => entry.key)).toEqual(['5-0', '6-1']);
    expect(affixEntries([])).toEqual([]);
  });

  it('outcomeLabel 映射 empowered/demonic，未知值给中性占位，undefined 返回 null', () => {
    expect(outcomeLabel('empowered')).toContain('强化');
    expect(outcomeLabel('demonic')).toContain('入魔');
    expect(outcomeLabel('weird')).toBe('结果已结算');
    expect(outcomeLabel(undefined)).toBeNull();
  });
});

describe('economy/presentation · 选物筛选与注入解析', () => {
  it('filterItems 按稀有度与关键字过滤，空筛选原样返回', () => {
    const items = [
      makeItem({ id: 1, name: '青锋剑', rarity: 1 }),
      makeItem({ id: 2, name: '玄铁甲', rarity: 2 }),
      makeItem({ id: 3, name: '青锋匕', rarity: 2 }),
    ];
    expect(filterItems(items, {})).toHaveLength(3);
    expect(filterItems(items, { rarity: 2 }).map((item) => item.id)).toEqual([2, 3]);
    expect(filterItems(items, { keyword: ' 青锋 ' }).map((item) => item.id)).toEqual([1, 3]);
    expect(filterItems(items, { rarity: '2', keyword: '匕' }).map((item) => item.id)).toEqual([3]);
    expect(filterItems(items, { keyword: '不存在' })).toEqual([]);
  });

  it('injectOptions 合并通货与精华，值带 kind 前缀', () => {
    expect(injectOptions([makeCurrency()], [makeEssence()])).toEqual([
      { label: '混沌石（通货 ×3）', value: 'currency:chaos' },
      { label: '锋锐精华（精华 ×2）', value: 'essence:ess_atk' },
    ]);
    expect(injectOptions([], [])).toEqual([]);
  });

  it('injectTarget 解析 kind/code，非法值返回 null', () => {
    expect(injectTarget('currency:chaos')).toEqual({ kind: 'currency', code: 'chaos' });
    expect(injectTarget('essence:ess_atk')).toEqual({ kind: 'essence', code: 'ess_atk' });
    expect(injectTarget('currency:')).toBeNull();
    expect(injectTarget('chaos')).toBeNull();
    expect(injectTarget(undefined)).toBeNull();
  });

  it('injectTargetName 只返回中文名，未知 code 给占位', () => {
    expect(injectTargetName([makeCurrency()], [makeEssence()], 'currency:chaos')).toBe('混沌石');
    expect(injectTargetName([makeCurrency()], [makeEssence()], 'essence:ess_atk')).toBe('锋锐精华');
    expect(injectTargetName([makeCurrency()], [makeEssence()], 'currency:nope')).toBe('未知通货');
    expect(injectTargetName([makeCurrency()], [makeEssence()], 'essence:nope')).toBe('未知精华');
    expect(injectTargetName([makeCurrency()], [makeEssence()], undefined)).toBe('');
  });
});
