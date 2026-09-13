/** 炼器可用性规则测试：14 op 的前置 / 定向参数 / 通货持有 / 请求组装 / 边界。 */
import { describe, expect, it } from 'vitest';
import { CRAFT_OPS } from '@idle-path/ionet-transport';
import type { CurrencyView, EssenceView, ItemView } from '@idle-path/ionet-transport';
import {
  buildCraftInput,
  craftBlockReason,
  craftOpOptions,
  extraParamOptions,
  rollableCount,
  type CraftContext,
} from './craft-rules.js';

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
  return { id: 1, code: 'chaos', name: '混沌石', description: '', implemented: true, owned: 3, ...overrides };
}

function makeEssence(overrides: Partial<EssenceView> = {}): EssenceView {
  return {
    id: 1,
    code: 'ess_atk',
    name: '锋锐精华',
    polarity: 'prefix',
    targetFamily: 'aff_atk',
    description: '',
    owned: 2,
    ...overrides,
  };
}

/** 造 `n` 条可 roll 词缀（key/value 都有）。 */
function rolled(count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    affixId: index + 1,
    value: 10 + index,
    polarity: 'prefix' as const,
    key: `k${index}`,
    code: `aff_${index}`,
    name: `词缀${index}`,
    tier: 1,
  }));
}

function ctx(overrides: Partial<CraftContext> = {}): CraftContext {
  const item = overrides.item === undefined ? makeItem({ affixes: rolled(4) }) : overrides.item;
  return {
    item,
    currencies: CRAFT_OPS.filter((op) => op !== 'essence').map((op, index) =>
      makeCurrency({ id: index + 1, code: op, name: `${op} 石`, owned: 2 }),
    ),
    essences: [makeEssence()],
    ...overrides,
  };
}

describe('craft-rules · 通用前置', () => {
  it('未选物品 / 非背包 / 传奇 一律拒绝且有中文原因', () => {
    expect(craftBlockReason('chaos', ctx({ item: null }))).toBe('先选择一件要炼的物品');
    expect(craftBlockReason('chaos', ctx({ item: makeItem({ status: 'equipped' }) }))).toBe('仅背包中的物品可炼器');
    expect(craftBlockReason('chaos', ctx({ item: makeItem({ rarity: 3 }) }))).toBe('传奇物品词缀固定，不可洗炼');
  });

  it('rollableCount 只数 key/value 齐全且非天定的词缀', () => {
    expect(rollableCount(makeItem({ affixes: rolled(2) }))).toBe(2);
    expect(
      rollableCount(
        makeItem({
          affixes: [
            ...rolled(2),
            { affixId: 9, value: null, polarity: 'base', key: null, code: 'b', name: '基底', tier: 0 },
            { affixId: 10, value: 5, polarity: 'prefix', key: 'k', fractured: true, code: 'f', name: '天定', tier: 1 },
          ],
        }),
      ),
    ).toBe(2);
  });
});

describe('craft-rules · 14 op 前置与可用性', () => {
  it('蜕变石 / 点金石 仅限凡品', () => {
    expect(craftBlockReason('transmute', ctx({ item: makeItem({ rarity: 0 }) }))).toBe('');
    expect(craftBlockReason('transmute', ctx())).toBe('仅可用于凡品');
    expect(craftBlockReason('alchemy', ctx())).toBe('仅可用于凡品');
  });

  it('混沌 / 重铸 / 神圣 / 崇高 要求灵品或宝品', () => {
    expect(craftBlockReason('chaos', ctx())).toBe('');
    expect(craftBlockReason('scour', ctx())).toBe('');
    expect(craftBlockReason('divine', ctx())).toBe('');
    expect(craftBlockReason('exalt', ctx())).toBe('');
    expect(craftBlockReason('chaos', ctx({ item: makeItem({ rarity: 0 }) }))).toBe('仅可用于灵品 / 宝品');
    expect(craftBlockReason('exalt', ctx({ item: makeItem({ rarity: 0 }) }))).toBe('需灵品及以上');
  });

  it('剥离 / 神圣 需要至少 1 条可 roll 词缀', () => {
    const bare = ctx({ item: makeItem({ affixes: [] }) });
    expect(craftBlockReason('annul', bare)).toBe('没有可剥离的词缀');
    expect(craftBlockReason('divine', bare)).toBe('没有可重 roll 数值的词缀');
    expect(craftBlockReason('annul', ctx())).toBe('');
  });

  it('破溃宝珠要求宝品且至少 4 条词缀', () => {
    expect(craftBlockReason('fracture', ctx({ item: makeItem({ rarity: 2, affixes: rolled(4) }) }))).toBe('');
    expect(craftBlockReason('fracture', ctx())).toBe('仅可用于宝品');
    expect(craftBlockReason('fracture', ctx({ item: makeItem({ rarity: 2, affixes: rolled(3) }) }))).toBe(
      '宝品至少 4 条词缀才可锁定',
    );
  });

  it('精华要求灵品/宝品且必须先选精华', () => {
    expect(craftBlockReason('essence', ctx())).toBe('先选择要使用的精华');
    expect(craftBlockReason('essence', ctx({ essenceCode: 'ess_atk' }))).toBe('');
    expect(craftBlockReason('essence', ctx({ essenceCode: 'nope' }))).toBe('所选精华不存在');
    expect(
      craftBlockReason('essence', ctx({ essenceCode: 'ess_atk', essences: [makeEssence({ owned: 0 })] })),
    ).toBe('精华不足：需要 1 枚');
    expect(craftBlockReason('essence', ctx({ item: makeItem({ rarity: 0 }) }))).toBe('仅可用于灵品 / 宝品');
  });

  it('古灵溶液必须先选基底词缀', () => {
    expect(craftBlockReason('wisp', ctx())).toBe('先选择要替换的基底词缀');
    expect(craftBlockReason('wisp', ctx({ targetCode: 'base_x' }))).toBe('');
  });

  it('缺通货 / 未实装 / 持有为 0 分别给不同原因', () => {
    expect(craftBlockReason('chaos', ctx({ currencies: [] }))).toBe('该工艺通货未开放');
    expect(
      craftBlockReason('chaos', ctx({ currencies: [makeCurrency({ implemented: false })] })),
    ).toBe('该通货尚未实装');
    expect(craftBlockReason('chaos', ctx({ currencies: [makeCurrency({ owned: 0 })] }))).toBe(
      '缺少该工艺通货（可用开发者注入）',
    );
  });

  it('craftOpOptions 覆盖全部 CRAFT_OPS，成本标签与禁用原因同屏', () => {
    const options = craftOpOptions(ctx());
    expect(options.map((option) => option.op)).toEqual([...CRAFT_OPS]);
    const chaos = options.find((option) => option.op === 'chaos');
    expect(chaos).toMatchObject({ available: true, costLabel: 'chaos 石 ×2' });
    const transmute = options.find((option) => option.op === 'transmute');
    expect(transmute?.available).toBe(false);
    expect(transmute?.disabledReason).toBe('仅可用于凡品');
    const essence = options.find((option) => option.op === 'essence');
    // 精华 op 本身可行（否则「未选精华 → op 禁用 → 选不了精华」会死锁），
    // 但炼器按钮仍被定向参数拦住（见下一条用例）。
    expect(essence).toMatchObject({ available: true, costLabel: '需先选精华' });
    expect(essence?.disabledReason).toBeUndefined();
    expect(craftBlockReason('essence', ctx())).toBe('先选择要使用的精华');
  });

  it('边界：item=null 时全部 op 不可用且原因一致', () => {
    const options = craftOpOptions(ctx({ item: null }));
    expect(options).toHaveLength(CRAFT_OPS.length);
    expect(options.every((option) => !option.available)).toBe(true);
    expect(options[0]?.disabledReason).toBe('先选择一件要炼的物品');
  });
});

describe('craft-rules · 定向参数与请求组装', () => {
  it('extraParamOptions：精华列全部（不足禁用），wisp 取物品基底词缀，其余不渲染', () => {
    const essences = [makeEssence({ owned: 2 }), makeEssence({ id: 2, code: 'ess_spirit', owned: 0 })];
    expect(extraParamOptions('essence', null, essences)).toEqual([
      { label: '锋锐精华 ×2', value: 'ess_atk', disabled: false },
      { label: '锋锐精华 ×0', value: 'ess_spirit', disabled: true },
    ]);

    const item = makeItem({
      affixes: [
        { affixId: 1, value: null, polarity: 'base', key: null, code: 'base_a', name: '锋芒', tier: 0 },
        ...rolled(1),
      ],
    });
    expect(extraParamOptions('wisp', item, essences)).toEqual([{ label: '锋芒', value: 'base_a' }]);
    expect(extraParamOptions('wisp', null, essences)).toEqual([]);
    expect(extraParamOptions('chaos', item, essences)).toBeUndefined();
    expect(extraParamOptions(undefined, item, essences)).toBeUndefined();
  });

  it('buildCraftInput：缺物品 / 缺 op / 缺定向参数 → null；否则只带必要字段', () => {
    expect(buildCraftInput(null, 'chaos')).toBeNull();
    expect(buildCraftInput(33, undefined)).toBeNull();
    expect(buildCraftInput(33, 'essence')).toBeNull();
    expect(buildCraftInput(33, 'wisp')).toBeNull();
    expect(buildCraftInput(33, 'chaos')).toEqual({ itemId: 33, op: 'chaos' });
    expect(buildCraftInput(33, 'essence', 'ess_atk')).toEqual({ itemId: 33, op: 'essence', essenceCode: 'ess_atk' });
    expect(buildCraftInput(33, 'wisp', undefined, 'base_a')).toEqual({ itemId: 33, op: 'wisp', targetCode: 'base_a' });
  });
});
