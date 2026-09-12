import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_CONFIG,
  DEFAULT_CONFIG,
  REALM_BASE_KEYS,
  sanitizeAction,
  sanitizeCosts,
  sanitizeCountRange,
  sanitizeInt,
  sanitizeRealmBase,
  sanitizeZonePower,
} from '../../src/common/config/app-config.js';

describe('sanitizeInt 边界', () => {
  const cases: Array<[unknown, number | undefined]> = [
    [5, 5], [5.9, 5], [-5.9, undefined], // -5.9 → floor(-6) 低于下界 0 → 回退
    ['5', undefined], [null, undefined], [undefined, undefined], [NaN, undefined],
    [Infinity, undefined], [-Infinity, undefined], [{}, undefined], [[], undefined],
  ];
  for (const [input, expected] of cases) {
    test(`sanitizeInt(${JSON.stringify(input)}, 9, 0, 10) -> ${String(expected ?? 9)}`, () => {
      assert.equal(sanitizeInt(input, 9, 0, 10), expected ?? 9);
    });
  }
  test('负下界区间内的负数合法', () => {
    assert.equal(sanitizeInt(-6, 9, -10, 10), -6);
  });
  test('恰好上下界取原值，越界回退', () => {
    assert.equal(sanitizeInt(0, 9, 0, 10), 0);
    assert.equal(sanitizeInt(10, 9, 0, 10), 10);
    assert.equal(sanitizeInt(-1, 9, 0, 10), 9);
    assert.equal(sanitizeInt(11, 9, 0, 10), 9);
  });
});

describe('sanitizeCosts 边界', () => {
  test('非数组 / 长度不足 14 -> 默认', () => {
    assert.deepEqual(sanitizeCosts(null), DEFAULT_CONFIG.realmBreakthroughCosts);
    assert.deepEqual(sanitizeCosts('x'), DEFAULT_CONFIG.realmBreakthroughCosts);
    assert.deepEqual(sanitizeCosts(new Array(13).fill(1)), DEFAULT_CONFIG.realmBreakthroughCosts);
  });
  test('恰好 14 项且合法 -> 原样', () => {
    const input = new Array(14).fill(0).map((_, i) => i * 10);
    assert.deepEqual(sanitizeCosts(input), input);
  });
  test('负数 / 非整数 -> 默认', () => {
    assert.deepEqual(sanitizeCosts(new Array(14).fill(-1)), DEFAULT_CONFIG.realmBreakthroughCosts);
    assert.deepEqual(sanitizeCosts(new Array(14).fill(NaN)), DEFAULT_CONFIG.realmBreakthroughCosts);
  });
  test('超过 15 项 -> 截断为 15', () => {
    const input = new Array(20).fill(0).map((_, i) => i);
    assert.equal(sanitizeCosts(input).length, 15);
  });
});

describe('sanitizeRealmBase 边界', () => {
  test('缺失/非对象 -> 默认', () => {
    assert.deepEqual(sanitizeRealmBase(null), DEFAULT_CONFIG.unitRealmBase);
    assert.deepEqual(sanitizeRealmBase('x'), DEFAULT_CONFIG.unitRealmBase);
  });
  test('任一属性缺失 -> 整体回退', () => {
    const partial: Record<string, unknown> = { ...DEFAULT_CONFIG.unitRealmBase };
    delete partial['hp'];
    assert.deepEqual(sanitizeRealmBase(partial), DEFAULT_CONFIG.unitRealmBase);
  });
  test('base<=0 或 growth<1 -> 回退', () => {
    for (const key of REALM_BASE_KEYS) {
      const bad = { ...DEFAULT_CONFIG.unitRealmBase, [key]: { base: 0, growth: 1.2 } };
      assert.deepEqual(sanitizeRealmBase(bad), DEFAULT_CONFIG.unitRealmBase, `${key} base=0`);
      const bad2 = { ...DEFAULT_CONFIG.unitRealmBase, [key]: { base: 1, growth: 0.9 } };
      assert.deepEqual(sanitizeRealmBase(bad2), DEFAULT_CONFIG.unitRealmBase, `${key} growth=0.9`);
    }
  });
  test('合法值原样返回', () => {
    const good = { hp: { base: 1, growth: 1 }, atk: { base: 2, growth: 2 }, def: { base: 3, growth: 1 }, spiritPower: { base: 4, growth: 1 }, lingyun: { base: 5, growth: 1 } };
    assert.deepEqual(sanitizeRealmBase(good), good);
  });
});

describe('sanitizeCountRange 边界', () => {
  test('非数组 -> 默认', () => {
    assert.deepEqual(sanitizeCountRange(null), DEFAULT_CONFIG.unitHiddenAffixCount);
    assert.deepEqual(sanitizeCountRange([1]), DEFAULT_CONFIG.unitHiddenAffixCount);
  });
  test('lo>hi / hi>6 / lo<0 -> 默认', () => {
    assert.deepEqual(sanitizeCountRange([3, 1]), DEFAULT_CONFIG.unitHiddenAffixCount);
    assert.deepEqual(sanitizeCountRange([0, 7]), DEFAULT_CONFIG.unitHiddenAffixCount);
    assert.deepEqual(sanitizeCountRange([-1, 2]), DEFAULT_CONFIG.unitHiddenAffixCount);
  });
  test('边界 [0,0] 与 [0,6] 合法', () => {
    assert.deepEqual(sanitizeCountRange([0, 0]), [0, 0]);
    assert.deepEqual(sanitizeCountRange([0, 6]), [0, 6]);
  });
});

describe('sanitizeZonePower 边界', () => {
  test('非对象/字段非法 -> 默认', () => {
    assert.deepEqual(sanitizeZonePower(null), DEFAULT_CONFIG.zonePower);
    assert.deepEqual(sanitizeZonePower({ realmWeight: 0, equipWeight: 1, skillDivisor: 1 }), DEFAULT_CONFIG.zonePower);
    assert.deepEqual(sanitizeZonePower({ realmWeight: 1, equipWeight: -1, skillDivisor: 1 }), DEFAULT_CONFIG.zonePower);
    assert.deepEqual(sanitizeZonePower({ realmWeight: 1, equipWeight: 1, skillDivisor: 0 }), DEFAULT_CONFIG.zonePower);
  });
  test('equipWeight=0 合法（边界）', () => {
    assert.deepEqual(sanitizeZonePower({ realmWeight: 1, equipWeight: 0, skillDivisor: 1 }), { realmWeight: 1, equipWeight: 0, skillDivisor: 1 });
  });
});

describe('sanitizeAction 边界', () => {
  test('四种合法值', () => {
    for (const action of ['keep', 'salvage', 'sell', 'discard']) {
      assert.equal(sanitizeAction(action), action);
    }
  });
  test('未知/大小写不符/非字符串 -> 默认', () => {
    for (const value of ['KEEP', '', null, 1, {}, undefined]) {
      assert.equal(sanitizeAction(value), DEFAULT_CONFIG.lootFallbackAction);
    }
  });
});

describe('APP_CONFIG 不变量', () => {
  test('默认配置自洽', () => {
    assert.ok(DEFAULT_CONFIG.maxCharactersPerAccount >= 1);
    assert.equal(DEFAULT_CONFIG.realmBreakthroughCosts.length >= 14, true);
    assert.ok(DEFAULT_CONFIG.idleEfficiencyPct > 0 && DEFAULT_CONFIG.idleEfficiencyPct <= 100);
    assert.ok(DEFAULT_CONFIG.zonePower.skillDivisor >= 1);
    assert.equal(DEFAULT_CONFIG.unitHiddenAffixCount[0] <= DEFAULT_CONFIG.unitHiddenAffixCount[1], true);
  });
  test('运行时 APP_CONFIG 已通过校验（非空、范围合法）', () => {
    assert.ok(APP_CONFIG.maxCharactersPerAccount >= 1);
    assert.ok(APP_CONFIG.devToolRateLimitPerMinute >= 1);
    assert.ok(APP_CONFIG.unitHiddenAffixCount[1] <= 6);
    assert.ok(['keep', 'salvage', 'sell', 'discard'].includes(APP_CONFIG.lootFallbackAction));
  });
});
