/**
 * §23 A3 挂机整轮结算纯函数边界测试（`idle-settlement.ts`）。
 *
 * 覆盖：非有限数 / 0 / 负数 / 小数、除不尽时的余数分配、单层退化、
 * items 预览上限、非有限通货值、空输入、lingyunTotal 取末次。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEMS_PREVIEW_CAP,
  aggregateSettlement,
  splitKillsByFloor,
} from '../../../src/modules/logic/idle/internal/idle-settlement.js';
import type { SettlementData } from '../../../src/modules/logic/combat/combat.api.js';
import type { ItemView } from '../../../src/modules/logic/item/item.api.js';

function item(id: number): ItemView {
  return {
    id,
    baseId: 1,
    baseCode: 'b1',
    name: '物品' + id,
    category: 'weapon',
    slot: null,
    rarity: 0,
    rarityName: '凡品',
    tier: 1,
    quality: 0,
    status: 'idle',
    affixTexts: [],
    affixes: [],
  };
}

function part(overrides: Partial<SettlementData> = {}): SettlementData {
  return {
    unit: { code: 'u', name: '单位', realm: 1 },
    kills: 1,
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
    ...overrides,
  };
}

describe('splitKillsByFloor 边界（循环整轮分摊）', () => {
  test('整除：每层均等，顺序为 1→n', () => {
    assert.deepEqual(splitKillsByFloor(60, 3), [20, 20, 20]);
    assert.deepEqual(splitKillsByFloor(6, 2), [3, 3]);
  });

  test('不整除：余数给前 rest 层各 +1（= 打完 q 个整轮 + 下一轮前 rest 层）', () => {
    assert.deepEqual(splitKillsByFloor(7, 3), [3, 2, 2]);
    assert.deepEqual(splitKillsByFloor(5, 2), [3, 2]);
    assert.deepEqual(splitKillsByFloor(8, 3), [3, 3, 2]);
  });

  test('不足一轮：只铺满前几层，后面的层拿 0（调用方据此跳过，不白送层灵韵）', () => {
    assert.deepEqual(splitKillsByFloor(1, 3), [1, 0, 0]);
    assert.deepEqual(splitKillsByFloor(2, 3), [1, 1, 0]);
  });

  test('单层秘境（floorCount=1）-> 全部击杀给第 1 层', () => {
    assert.deepEqual(splitKillsByFloor(9, 1), [9]);
  });

  test('小数输入：kills 先 floor，floorCount 先 floor', () => {
    assert.deepEqual(splitKillsByFloor(2.9, 3), [1, 1, 0]);
    assert.deepEqual(splitKillsByFloor(5, 2.9), [3, 2]);
    assert.deepEqual(splitKillsByFloor(0.9, 3), []);
  });

  test('非有限 / 非正输入 -> 空数组（调用方不结算任何层）', () => {
    for (const [kills, count] of [
      [0, 3],
      [-1, 3],
      [Number.NaN, 3],
      [Number.POSITIVE_INFINITY, 3],
      [Number.NEGATIVE_INFINITY, 3],
      [5, 0],
      [5, -2],
      [5, Number.NaN],
      [5, Number.POSITIVE_INFINITY],
    ] as Array<[number, number]>) {
      assert.deepEqual(splitKillsByFloor(kills, count), [], `${kills} / ${count}`);
    }
  });

  test('kills>0 且层数>0 时：返回长度恒为层数，各层之和恒等于 floor(kills)', () => {
    for (const [kills, count] of [
      [1, 1],
      [1, 5],
      [37, 4],
      [1000, 13],
    ] as Array<[number, number]>) {
      const parts = splitKillsByFloor(kills, count);
      assert.equal(parts.length, count);
      assert.equal(
        parts.reduce((a, b) => a + b, 0),
        Math.floor(kills),
        `${kills} / ${count}`,
      );
      assert.ok(parts.every((n) => n >= 0));
    }
  });

  test('单调不增：前层拿到的击杀永不小于后层', () => {
    const parts = splitKillsByFloor(17, 5);
    for (let i = 1; i < parts.length; i++) assert.ok(parts[i]! <= parts[i - 1]!);
    assert.deepEqual(parts, [4, 4, 3, 3, 3]);
  });
});

describe('aggregateSettlement 边界（多层聚合口径）', () => {
  test('空输入 -> 全零，且 kills 仍取整轮总数', () => {
    assert.deepEqual(aggregateSettlement([], 12), {
      kills: 12,
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
    });
  });

  test('kills 边界：非有限 / 负数 / 0 / 小数 -> 0,0,0,floor', () => {
    const cases: Array<[number, number]> = [
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [-5, 0],
      [0, 0],
      [7.9, 7],
    ];
    for (const [input, expected] of cases) {
      assert.equal(aggregateSettlement([], input).kills, expected, String(input));
    }
  });

  test('数值项累加、对象逐字段累加、按 key 累加，lingyunTotal 取末次', () => {
    const merged = aggregateSettlement(
      [
        part({
          lingyunGained: 10,
          lingyunTotal: 110,
          kept: 1,
          discarded: 2,
          blockedByTier: 3,
          itemsProduced: 4,
          salvaged: { count: 5, lingyun: 50 },
          sold: { count: 6, spiritStones: 60 },
          currencies: { a: 1, b: 2 },
          essences: { e: 3 },
        }),
        part({
          lingyunGained: 100,
          lingyunTotal: 210,
          kept: 10,
          discarded: 20,
          blockedByTier: 30,
          itemsProduced: 40,
          salvaged: { count: 500, lingyun: 5000 },
          sold: { count: 600, spiritStones: 6000 },
          currencies: { a: 10 },
          essences: { e: 30, f: 40 },
        }),
      ],
      7,
    );
    assert.deepEqual(merged, {
      kills: 7,
      lingyunGained: 110,
      lingyunTotal: 210,
      items: [],
      kept: 11,
      salvaged: { count: 505, lingyun: 5050 },
      sold: { count: 606, spiritStones: 6060 },
      discarded: 22,
      blockedByTier: 33,
      currencies: { a: 11, b: 2 },
      essences: { e: 33, f: 40 },
      itemsProduced: 44,
    });
  });

  test('items 合并后整体截断到预览上限（kept 不被截断）', () => {
    const first = Array.from({ length: ITEMS_PREVIEW_CAP - 5 }, (_, i) => item(i + 1));
    const second = Array.from({ length: 20 }, (_, i) => item(1000 + i));
    const merged = aggregateSettlement([part({ items: first, kept: 45 }), part({ items: second, kept: 20 })], 2);
    assert.equal(merged.items.length, ITEMS_PREVIEW_CAP);
    assert.equal(merged.items[0]?.id, 1, '保持首次调用的物品在前');
    assert.equal(merged.items[merged.items.length - 1]?.id, 1004, '按顺序截断到上限（45 + 5）');
    assert.equal(merged.kept, 65, 'kept 是真实件数，不受预览上限影响');
  });

  test('items 恰好等于上限时不丢弃、不越界', () => {
    const exactly = Array.from({ length: ITEMS_PREVIEW_CAP }, (_, i) => item(i + 1));
    const merged = aggregateSettlement([part({ items: exactly }), part({ items: [item(999)] })], 1);
    assert.equal(merged.items.length, ITEMS_PREVIEW_CAP);
    assert.ok(!merged.items.some((entry) => entry.id === 999));
  });

  test('非有限通货/精华值按 0 计（防 NaN 污染整轮聚合，且不凭空造出键）', () => {
    const merged = aggregateSettlement(
      [
        part({ currencies: { a: 1 }, essences: { e: 2 } }),
        part({ currencies: { a: Number.NaN, b: Number.POSITIVE_INFINITY }, essences: { e: Number.NaN } }),
      ],
      1,
    );
    assert.deepEqual(merged.currencies, { a: 1 });
    assert.deepEqual(merged.essences, { e: 2 });
  });

  test('单次调用退化为原值（单层秘境口径与旧实现一致）', () => {
    const single = part({ unit: { code: 'u1', name: '单位', realm: 1 }, kills: 30, lingyunGained: 5, lingyunTotal: 999, kept: 2, itemsProduced: 2 });
    assert.deepEqual(aggregateSettlement([single], 30), {
      kills: 30,
      lingyunGained: 5,
      lingyunTotal: 999,
      items: [],
      kept: 2,
      salvaged: { count: 0, lingyun: 0 },
      sold: { count: 0, spiritStones: 0 },
      discarded: 0,
      blockedByTier: 0,
      currencies: {},
      essences: {},
      itemsProduced: 2,
    });
  });
});
