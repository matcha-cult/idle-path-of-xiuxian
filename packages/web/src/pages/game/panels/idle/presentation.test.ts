/**
 * 挂机面板展示判定测试（`idle/presentation.ts`）。
 *
 * 重点：§23 A3 起结算不再是「单一单位」，逐层清单 / 标题 / 明细都必须按层呈现，
 * 且空分支（kills=0）与调试单单位分支（floors=[]）都不能崩、不能把协议字段打上屏。
 */
import { describe, expect, it } from 'vitest';
import type {
  CurrencyView,
  EssenceView,
  IdleFloorView,
  IdleSettleData,
  IdleSettleEmptyData,
} from '@idle-path/ionet-transport';
import {
  idleFloorEntries,
  idleRuleEntries,
  idleSettleEntries,
  idleSettleSubtitle,
  resourceNameOf,
} from './presentation.js';

function floor(overrides: Partial<IdleFloorView> = {}): IdleFloorView {
  return { floor: 1, unitCode: 'u1', unitName: '灵狼', isBoss: false, kills: 4, ...overrides };
}

function settle(overrides: Partial<IdleSettleData> = {}): IdleSettleData {
  return {
    kills: 8,
    lingyunGained: 20,
    lingyunTotal: 100,
    items: [],
    kept: 1,
    salvaged: { count: 0, lingyun: 0 },
    sold: { count: 0, spiritStones: 0 },
    discarded: 0,
    blockedByTier: 0,
    currencies: {},
    essences: {},
    itemsProduced: 2,
    zone: { code: 'z', name: '青云山', maxFloor: 3 },
    floors: [floor(), floor({ floor: 3, unitName: '狼王', isBoss: true, kills: 4 })],
    offlineHours: 3,
    effectiveHours: 1.5,
    dailyItemsProduced: 7,
    dailyItemCap: 200,
    ...overrides,
  } as IdleSettleData;
}

const EMPTY: IdleSettleEmptyData = {
  zone: null,
  floors: [],
  offlineHours: 0,
  effectiveHours: 0,
  kills: 0,
  lingyunGained: 0,
  lingyunTotal: 0,
  items: [],
  kept: 0,
  salvaged: { count: 0, lingyun: 0 },
  sold: { count: 0, spiritStones: 0 },
  discarded: 0,
  blockedByTier: 0,
  currencies: {},
  essences: {},
  itemsProduced: 0,
  dailyItemsProduced: 0,
  dailyItemCap: 200,
};

describe('idleRuleEntries', () => {
  it('把服务端 config 翻译成节奏/效率/封顶三行', () => {
    const entries = idleRuleEntries({ roundsPerHour: 60, efficiencyPct: 60, maxOfflineHours: 12 });
    expect(entries.map((entry) => entry.label)).toEqual(['结算节奏', '挂机效率', '离线封顶']);
    expect(entries[0]?.value).toBe('每轮 1 分');
    expect(entries[1]?.value).toBe('60%');
    expect(entries[2]?.value).toBe('12 小时');
  });

  it('边界：roundsPerHour=0 / NaN / 负数 -> 节奏显示占位符，不产生 Infinity 文案', () => {
    for (const rounds of [0, Number.NaN, -1]) {
      const entries = idleRuleEntries({ roundsPerHour: rounds, efficiencyPct: 60, maxOfflineHours: 12 });
      expect(entries[0]?.value).toBe('—');
    }
  });
});

describe('idleFloorEntries', () => {
  it('逐层清单：第 N 层 · 单位 ×击杀，Boss 层带标注', () => {
    const entries = idleFloorEntries([
      floor({ floor: 1, unitName: '灵狼', kills: 12 }),
      floor({ floor: 3, unitName: '狼王', isBoss: true, kills: 5 }),
    ]);
    expect(entries.map((entry) => entry.label)).toEqual(['第 1 层', '第 3 层（Boss）']);
    expect(entries.map((entry) => entry.value)).toEqual(['灵狼 ×12', '狼王 ×5']);
  });

  it('边界：空数组 -> []（调试单单位结算不渲染逐层段）', () => {
    expect(idleFloorEntries([])).toEqual([]);
  });

  it('边界：非法层号 / 负数击杀 / 空单位名都有兜底文案', () => {
    const entries = idleFloorEntries([
      floor({ floor: Number.NaN, unitName: '', kills: -3 }),
      floor({ floor: 0, unitName: '灵狼', kills: Number.NaN }),
    ]);
    expect(entries[0]?.label).toBe('本层');
    expect(entries[0]?.value).toBe('未知单位 ×0');
    expect(entries[1]?.label).toBe('本层');
    expect(entries[1]?.value).toBe('灵狼 ×0');
  });

  it('key 唯一（同层号重复出现也不冲突）', () => {
    const entries = idleFloorEntries([floor({ floor: 1 }), floor({ floor: 1 })]);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(2);
  });
});

describe('idleSettleEntries', () => {
  it('整轮结算：插入「本轮层数」并保留时长/额度', () => {
    const entries = idleSettleEntries(settle());
    expect(entries.map((entry) => entry.label)).toEqual([
      '结算秘境',
      '本轮层数',
      '离线时长',
      '有效时长',
      '今日物品产出',
    ]);
    expect(entries[0]?.value).toBe('青云山');
    expect(entries[1]?.value).toBe('2 层');
    expect(entries[2]?.value).toBe('3 小时');
    expect(entries[3]?.value).toBe('1 小时 30 分');
    expect(entries[4]?.value).toBe('7 / 200');
  });

  it('边界：floors 为空（调试单单位）不插入「本轮层数」；zone 为 null 显示占位符', () => {
    const entries = idleSettleEntries(settle({ floors: [], zone: null }));
    expect(entries.map((entry) => entry.label)).not.toContain('本轮层数');
    expect(entries[0]?.value).toBe('—');
  });
});

describe('idleSettleSubtitle', () => {
  it('整轮结算：秘境 · 层数 · 击杀', () => {
    expect(idleSettleSubtitle(settle())).toBe('青云山 · 2 层 · 击杀 8');
  });

  it('空分支（kills=0）：明确说「暂无可结算收益」', () => {
    expect(idleSettleSubtitle(EMPTY)).toBe('离线 0 分 · 暂无可结算收益');
  });

  it('边界：kills 为负也按空分支；zone=null 时不出现「null 层」', () => {
    expect(idleSettleSubtitle(EMPTY)).toContain('暂无可结算收益');
    expect(idleSettleSubtitle(settle({ zone: null, floors: [] }))).toBe('击杀 8');
    expect(idleSettleSubtitle(settle({ floors: [] }))).toBe('击杀 8');
  });
});

describe('resourceNameOf', () => {
  it('命中字典用中文名，未命中降级为占位（绝不回显 code）', () => {
    const currencies: CurrencyView[] = [
      { id: 1, code: 'chaos', name: '混沌石', description: '', implemented: true, owned: 0 },
    ];
    const essences: EssenceView[] = [
      { id: 2, code: 'e_fire', name: '火精', polarity: 'yang', targetFamily: 'weapon', description: '', owned: 0 },
    ];
    const nameOf = resourceNameOf(currencies, essences);
    expect(nameOf('chaos')).toBe('混沌石');
    expect(nameOf('e_fire')).toBe('火精');
    expect(nameOf('nope')).toBe('未知掉落');
  });

  it('边界：空字典 -> 一律占位符', () => {
    expect(resourceNameOf([], [])('chaos')).toBe('未知掉落');
  });
});
