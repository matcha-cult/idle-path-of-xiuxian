/**
 * 各域 types 模块的常量与纯函数契约测试。
 *
 * 覆盖：
 * - item.types：RARITY_NAMES / EQUIP_SLOT_KEYS / ITEM_SLOT_BASE / EFFECT_LABELS / PERCENT_KEYS
 * - skill.types：DAOJI_SET / PANEL_LIMITS / emptyPanel() / fail()
 * - unit.types：UNIT_CAMPS / fail()
 * - currency.types：CRAFT_OPS / fail()
 * - zone.types / quest.types：从 unit.types 的 fail / FailResult 再导出是否正确
 *
 * 约定：type-only 的 FailResult 再导出由「赋给显式类型变量」在 typecheck:test 阶段验证。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  RARITY_NAMES,
  EQUIP_SLOT_KEYS,
  ITEM_SLOT_BASE,
  EFFECT_LABELS as ITEM_EFFECT_LABELS,
  PERCENT_KEYS as ITEM_PERCENT_KEYS,
} from '../../../src/modules/game/item/item.types.js';
import { EFFECT_LABELS, PERCENT_KEYS } from '../../../src/common/kernel/effect.js';

import {
  DAOJI_SET,
  PANEL_LIMITS,
  emptyPanel,
  fail as skillFail,
} from '../../../src/modules/logic/skill/internal/skill.types.js';
import type { PanelSlots } from '../../../src/modules/logic/skill/internal/skill.types.js';

import {
  UNIT_CAMPS,
  fail as unitFail,
} from '../../../src/modules/logic/combat/combat.api.js';
import { CRAFT_OPS, fail as currencyFail } from '../../../src/modules/logic/economy/internal/currency.types.js';
import {
  fail as zoneFail,
  progressOf,
  floorRequirement,
  isBossFloor,
  tierOffsetBonusFor,
  dropDrawBonusFor,
} from '../../../src/modules/logic/zone/internal/zone.types.js';
import { fail as questFail, QUEST_STATUSES } from '../../../src/modules/logic/quest/internal/quest.types.js';

// 编译期验证 type-only 再导出可用
import type { FailResult as ZoneFailResult } from '../../../src/modules/logic/zone/internal/zone.types.js';
import type { FailResult as QuestFailResult } from '../../../src/modules/logic/quest/internal/quest.types.js';
import type { ZoneRow } from '../../../src/modules/logic/zone/internal/zone.types.js';

function assertUniqueNonEmpty(name: string, values: readonly string[]): void {
  assert.ok(values.length > 0, name + ' 应非空');
  assert.equal(new Set(values).size, values.length, name + ' 不应有重复项');
}

function assertFailShape(res: { success: boolean; message: string; data: { code: string } }): void {
  assert.equal(res.success, false);
  assert.equal(typeof res.message, 'string');
  assert.deepEqual(Object.keys(res).sort(), ['data', 'message', 'success']);
  assert.deepEqual(Object.keys(res.data), ['code']);
  assert.equal(typeof res.data.code, 'string');
}

// =====================================================================
describe('item.types 常量', () => {
  test('RARITY_NAMES 非空唯一，顺序为 凡/灵/宝/传奇', () => {
    assertUniqueNonEmpty('RARITY_NAMES', RARITY_NAMES);
    assert.deepEqual([...RARITY_NAMES], ['凡品', '灵品', '宝品', '传奇']);
  });

  test('EQUIP_SLOT_KEYS 含双戒指 ring1/ring2 且唯一', () => {
    assertUniqueNonEmpty('EQUIP_SLOT_KEYS', EQUIP_SLOT_KEYS);
    assert.ok(EQUIP_SLOT_KEYS.includes('ring1'), '应包含 ring1');
    assert.ok(EQUIP_SLOT_KEYS.includes('ring2'), '应包含 ring2');
    // 双戒指必须是两个不同槽位
    assert.notEqual(EQUIP_SLOT_KEYS.indexOf('ring1'), EQUIP_SLOT_KEYS.indexOf('ring2'));
    // 每个槽位都是非空字符串
    for (const key of EQUIP_SLOT_KEYS) {
      assert.equal(typeof key, 'string');
      assert.ok(key.length > 0);
    }
  });

  test('ITEM_SLOT_BASE：ring 走特殊键，且不含 ring1/ring2', () => {
    assert.equal(ITEM_SLOT_BASE.ring, 'ring');
    assert.equal(ITEM_SLOT_BASE.weapon, 'weapon');
    assert.equal(ITEM_SLOT_BASE.belt, 'belt');
    assert.ok(!('ring1' in ITEM_SLOT_BASE), 'ITEM_SLOT_BASE 不应出现 ring1');
    assert.ok(!('ring2' in ITEM_SLOT_BASE), 'ITEM_SLOT_BASE 不应出现 ring2');
    // 映射值非空
    for (const value of Object.values(ITEM_SLOT_BASE)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0);
    }
  });

  test('EFFECT_LABELS / PERCENT_KEYS 从共享内核再导出（同一引用）', () => {
    assert.strictEqual(ITEM_EFFECT_LABELS, EFFECT_LABELS);
    assert.strictEqual(ITEM_PERCENT_KEYS, PERCENT_KEYS);
    assert.equal(EFFECT_LABELS.atk, '攻击');
    assert.ok(PERCENT_KEYS.has('crit'));
    assert.ok(!PERCENT_KEYS.has('atk'), 'atk 属非百分比键');
  });
});

// =====================================================================
describe('skill.types 常量与纯函数', () => {
  test('DAOJI_SET 非空唯一，含剑/雷/火/冰/体/阵/丹/符', () => {
    assertUniqueNonEmpty('DAOJI_SET', DAOJI_SET);
    assert.deepEqual([...DAOJI_SET].sort(), [...'剑雷火冰体阵丹符'].sort());
  });

  test('PANEL_LIMITS 各上限为正整数', () => {
    assert.ok(Number.isInteger(PANEL_LIMITS.aux) && PANEL_LIMITS.aux > 0, 'aux 上限应 > 0');
    assert.ok(Number.isInteger(PANEL_LIMITS.shufa) && PANEL_LIMITS.shufa > 0, 'shufa 上限应 > 0');
  });

  test('emptyPanel() 结构固定且每次返回全新对象（不可共享引用）', () => {
    // 注意：node 的 assert.deepEqual 是断言函数，会把 a 窄化到字面量类型；
    // 显式用 PanelSlots 类型的 empty 作为期望值，避免后续赋值被窄化为 null/never[]。
    const empty: PanelSlots = { xinfa: { main: null, aux: [] }, shufa: [] };
    const a = emptyPanel();
    const b = emptyPanel();
    assert.deepEqual(a, empty);
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(a.xinfa, b.xinfa);
    assert.notStrictEqual(a.xinfa.aux, b.xinfa.aux);
    assert.notStrictEqual(a.shufa, b.shufa);
    // 修改 a 不得污染 b
    a.xinfa.main = 'x';
    a.xinfa.aux.push('y');
    a.shufa.push('z');
    assert.deepEqual(b, empty);
  });

  test('fail() 结构固定', () => {
    const res = skillFail('CODE_X', '消息');
    assertFailShape(res);
    assert.equal(res.data.code, 'CODE_X');
    assert.equal(res.message, '消息');
  });
});

// =====================================================================
describe('unit.types 常量与纯函数', () => {
  test('UNIT_CAMPS 非空唯一', () => {
    assertUniqueNonEmpty('UNIT_CAMPS', UNIT_CAMPS);
    assert.deepEqual([...UNIT_CAMPS], ['hostile', 'neutral', 'friendly']);
  });

  test('fail() 结构固定', () => {
    const res = unitFail('CODE_Y', '消息');
    assertFailShape(res);
    assert.equal(res.data.code, 'CODE_Y');
  });
});

// =====================================================================
describe('currency.types 常量与纯函数', () => {
  test('CRAFT_OPS 非空唯一', () => {
    assertUniqueNonEmpty('CRAFT_OPS', CRAFT_OPS);
  });

  test('fail() 结构固定', () => {
    const res = currencyFail('CODE_Z', '消息');
    assertFailShape(res);
    assert.equal(res.data.code, 'CODE_Z');
  });
});

// =====================================================================
describe('zone.types 再导出与纯函数', () => {
  test('fail 与 unit.types 为同一引用（再导出正确）', () => {
    assert.strictEqual(zoneFail, unitFail);
  });

  test('FailResult 类型再导出可用（编译期）', () => {
    const res: ZoneFailResult = zoneFail('ZONE_ERR', '秘境错误');
    assert.equal(res.data.code, 'ZONE_ERR');
  });

  const zone: ZoneRow = {
    id: 1, code: 'z', name: 'z', chapter: 1, order_index: 1, min_realm: 1,
    unit_code: 'u', boss_code: 'b', base_power: 100, power_step: 50,
    max_floor: 10, lingyun_bonus_per_floor: 1, boss_every_floors: 5,
    require_prev_best_floor: 0, tier_bonus_every_floors: 3, drop_bonus_every_floors: 4,
  };
  const noBonus: ZoneRow = {
    ...zone, boss_code: null, boss_every_floors: 0,
    tier_bonus_every_floors: 0, drop_bonus_every_floors: 0,
  };

  test('progressOf：无进度回退 1/0/false，有进度做数值转换', () => {
    assert.deepEqual(progressOf(null), { floor: 1, bestFloor: 0, cleared: false });
    assert.deepEqual(
      progressOf({ id: 1, character_id: 1, zone_id: 1, floor: '3', best_floor: '5', cleared: 1 } as never),
      { floor: 3, bestFloor: 5, cleared: true },
    );
  });

  test('floorRequirement：首层 = base，逐层 + step', () => {
    assert.equal(floorRequirement(zone, 1), 100);
    assert.equal(floorRequirement(zone, 2), 150);
    assert.equal(floorRequirement(zone, 3), 200);
  });

  test('isBossFloor：无 boss / boss 间隔为 0 时恒 false，否则整除判定', () => {
    assert.equal(isBossFloor(noBonus, 5), false);
    assert.equal(isBossFloor(zone, 4), false);
    assert.equal(isBossFloor(zone, 5), true);
    assert.equal(isBossFloor(zone, 10), true);
  });

  test('tierOffsetBonusFor / dropDrawBonusFor：0 禁用，否则 floor-1 整除', () => {
    assert.equal(tierOffsetBonusFor(noBonus, 10), 0);
    assert.equal(tierOffsetBonusFor(zone, 1), 0);
    assert.equal(tierOffsetBonusFor(zone, 3), 0);
    assert.equal(tierOffsetBonusFor(zone, 4), 1);
    assert.equal(tierOffsetBonusFor(zone, 10), 3);
    assert.equal(dropDrawBonusFor(noBonus, 10), 0);
    assert.equal(dropDrawBonusFor(zone, 1), 0);
    assert.equal(dropDrawBonusFor(zone, 4), 0);
    assert.equal(dropDrawBonusFor(zone, 5), 1);
    assert.equal(dropDrawBonusFor(zone, 9), 2);
  });
});

// =====================================================================
describe('quest.types 再导出与常量', () => {
  test('fail 与 unit.types 为同一引用（再导出正确）', () => {
    assert.strictEqual(questFail, unitFail);
  });

  test('FailResult 类型再导出可用（编译期）', () => {
    const res: QuestFailResult = questFail('QUEST_ERR', '任务错误');
    assert.equal(res.data.code, 'QUEST_ERR');
  });

  test('QUEST_STATUSES 非空唯一', () => {
    assertUniqueNonEmpty('QUEST_STATUSES', QUEST_STATUSES);
    assert.deepEqual([...QUEST_STATUSES], ['locked', 'active', 'completed']);
  });
});
