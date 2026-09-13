/**
 * 在线历练节奏的纯函数与常量边界测试（P3.0 T3 / §3.1）。
 *
 * 这一组是「数值 → 击杀数」的唯一实现，边界必须钉死：
 * 非有限数、门槛 0、碾压比上下界、单 tick 上限、小数进位、tickMs 非法。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ONLINE_TICK,
  killRatePerSecond,
  killsForTick,
  powerRatio,
} from '../../../src/modules/logic/zone/internal/online-tick.config.js';

describe('ONLINE_TICK 常量（§3.1 定稿值）', () => {
  test('取值与任务书 §3.1 一致，且都是有限数', () => {
    assert.equal(ONLINE_TICK.tickMs, 1000);
    assert.equal(ONLINE_TICK.pushEveryMs, 3000);
    assert.equal(ONLINE_TICK.killsPerSecondBase, 1);
    assert.deepEqual(ONLINE_TICK.ratioClamp, [0.5, 4]);
    assert.equal(ONLINE_TICK.killsPerFloor, 30);
    assert.equal(ONLINE_TICK.idleKillsPerSecCeiling, 20);
  });

  test('夹取区间合法（下界 < 上界、都为正）', () => {
    const [lo, hi] = ONLINE_TICK.ratioClamp;
    assert.ok(lo > 0 && hi > lo);
  });

  test('10 秒推送次数上限 = ceil(10000 / pushEveryMs) = 4（节流用例的判据）', () => {
    assert.equal(Math.ceil(10_000 / ONLINE_TICK.pushEveryMs), 4);
  });
});

describe('powerRatio 边界', () => {
  test('常规比值', () => {
    assert.equal(powerRatio(75, 75), 1);
    assert.equal(powerRatio(150, 75), 2);
    assert.equal(powerRatio(37.5, 75), 0.5);
  });

  test('门槛 0 / 负门槛 → NaN（不产生 Infinity 速率）', () => {
    assert.ok(Number.isNaN(powerRatio(100, 0)));
    assert.ok(Number.isNaN(powerRatio(100, -5)));
  });

  test('非有限输入 → NaN', () => {
    assert.ok(Number.isNaN(powerRatio(Number.NaN, 75)));
    assert.ok(Number.isNaN(powerRatio(75, Number.NaN)));
    assert.ok(Number.isNaN(powerRatio(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)));
  });

  test('战力 0 → 0（不是 NaN）', () => {
    assert.equal(powerRatio(0, 75), 0);
  });
});

describe('killRatePerSecond 边界', () => {
  test('r=1 → 1 只/秒；r=3 → 3；恰好在夹取上界', () => {
    assert.equal(killRatePerSecond(1), 1);
    assert.equal(killRatePerSecond(3), 3);
    assert.equal(killRatePerSecond(4), 4);
  });

  test('r 低于下界 → 夹到 0.5 只/秒（2 秒 1 只，卡层也还能磨）', () => {
    assert.equal(killRatePerSecond(0.5), 0.5);
    assert.equal(killRatePerSecond(0.1), 0.5);
    assert.equal(killRatePerSecond(0), 0.5);
    assert.equal(killRatePerSecond(-3), 0.5);
  });

  test('r 高于上界 → 夹到 4', () => {
    assert.equal(killRatePerSecond(4.1), 4);
    assert.equal(killRatePerSecond(1000), 4);
    assert.equal(killRatePerSecond(Number.POSITIVE_INFINITY), 0.5, '非有限数保守取下界');
  });

  test('NaN → 下界（绝不放大产出）', () => {
    assert.equal(killRatePerSecond(Number.NaN), 0.5);
  });
});

describe('killsForTick 边界（含小数进位与单 tick 上限）', () => {
  test('r=1：每 tick 恰好 1 只，10 tick 累计 10 只', () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = killsForTick(killRatePerSecond(1), 1000, carry);
      carry = r.carry;
      total += r.kills;
    }
    assert.equal(total, 10);
    assert.equal(carry, 0);
  });

  test('r=1.333…：进位不丢，10 tick 累计 13 只（不是 10）', () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = killsForTick(killRatePerSecond(4 / 3), 1000, carry);
      carry = r.carry;
      total += r.kills;
    }
    assert.equal(total, 13);
    assert.ok(Math.abs(carry - 0.33) < 0.02);
  });

  test('r=0.5：2 tick 才 1 只（10 tick 累计 5 只）', () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = killsForTick(killRatePerSecond(0.5), 1000, carry);
      carry = r.carry;
      total += r.kills;
    }
    assert.equal(total, 5);
  });

  test('单 tick 上限：raw 超过 ceiling 时截断，且截掉的部分**不攒进位**', () => {
    // rate=4、tickMs=10000 → raw=40，ceiling=20 → 20 只，进位只留小数
    const r = killsForTick(4, 10_000, 0, ONLINE_TICK.idleKillsPerSecCeiling);
    assert.equal(r.kills, 20);
    assert.ok(r.carry < 1, '被上限截掉的部分不得攒成补算');
  });

  test('tickMs 被调大仍受 ceiling 兜底（防爆）', () => {
    const r = killsForTick(4, 60_000, 0);
    assert.equal(r.kills, ONLINE_TICK.idleKillsPerSecCeiling);
  });

  test('ceiling=0 → 恒 0 击杀（关掉产出的极端配置不崩）', () => {
    assert.equal(killsForTick(4, 1000, 0, 0).kills, 0);
  });

  test('非法输入：rate=NaN / 负数 / tickMs=0 / 负数 → 0 击杀且进位不清零', () => {
    assert.deepEqual(killsForTick(Number.NaN, 1000, 0.5), { kills: 0, carry: 0.5 });
    assert.deepEqual(killsForTick(-1, 1000, 0.5), { kills: 0, carry: 0.5 });
    assert.deepEqual(killsForTick(1, 0, 0.5), { kills: 0, carry: 0.5 });
    assert.deepEqual(killsForTick(1, -1000, 0.5), { kills: 0, carry: 0.5 });
  });

  test('非法进位：NaN / 负数 / Infinity 一律当 0（不产生负产出）', () => {
    assert.deepEqual(killsForTick(1, 1000, Number.NaN), { kills: 1, carry: 0 });
    assert.deepEqual(killsForTick(1, 1000, -5), { kills: 1, carry: 0 });
    assert.deepEqual(killsForTick(1, 1000, Number.POSITIVE_INFINITY), { kills: 1, carry: 0 });
  });

  test('恰好整数时进位为 0（不会因浮点残留每 tick 多送一只）', () => {
    const r = killsForTick(2, 1000, 0);
    assert.equal(r.kills, 2);
    assert.equal(r.carry, 0);
  });
});
