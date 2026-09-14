import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IdleService } from '../../../src/modules/logic/idle/internal/idle.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { fail } from '../../../src/common/kernel/result.js';
import type { SettleResult, SettlementData } from '../../../src/modules/logic/combat/combat.api.js';
import type { ZoneIdleFloor, ZoneIdlePlan } from '../../../src/modules/logic/zone/internal/zone.types.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';
import type { Character } from '../../../src/modules/character/character.service.js';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 11,
    userId: 7,
    nickname: '道友',
    gender: 'male',
    title: null,
    spiritStones: 0,
    silver: 0,
    realm: 3,
    lingyun: 100,
    jadeSlips: 0,
    ...overrides,
  };
}

function okSettle(overrides: Partial<SettlementData> = {}): SettleResult {
  return {
    ok: true,
    data: {
      unit: { code: 'slime', name: '史莱姆', realm: 1 },
      kills: 0,
      lingyunGained: 0,
      lingyunTotal: 100,
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
    },
  };
}

function realmLingyun(realm: number): number {
  const rb = APP_CONFIG.unitRealmBase.lingyun;
  return Math.round(rb.base * Math.pow(rb.growth, realm - 1));
}

function makeService(opts: {
  db: FakeDatabase;
  character?: Character | null;
  /** §23 A3：挂机点整轮计划（null = 没设挂机点 / 不可挂机）。 */
  plan?: ZoneIdlePlan | null;
  settle?: SettleResult;
  /** 逐层结算的返回（按调用次序出队）；给了则优先于 `settle`。 */
  settleSeq?: SettleResult[];
  /** §22 Q6：是否在线战斗中（game_zone_state 有行）。缺省 false。 */
  inBattle?: boolean;
}) {
  const character = opts.character === undefined ? makeChar() : opts.character;
  const charStub = { findByUserId: stub(async () => character) };
  const queue = opts.settleSeq === undefined ? null : [...opts.settleSeq];
  const unitStub = {
    settleKills: stub(async () => {
      if (queue && queue.length > 0) return queue.shift() as SettleResult;
      return opts.settle ?? okSettle();
    }),
  };
  // §22/§23：zone 域供 idle 域复用的两个挂钩。缺省：不在线、无挂机点。
  // 挂机点「缺失」与「不可挂机」在 zone 域都收敛成 idlePlan=null，这里一并模拟。
  const zoneStub = {
    inOnlineBattle: stub(async () => opts.inBattle ?? false),
    idlePlan: stub(async () => opts.plan ?? null),
  };
  const svc = new IdleService(
    opts.db as never,
    opts.db as never,
    charStub as never,
    unitStub as never,
    zoneStub as never,
  );
  return { svc, charStub, unitStub, zoneStub };
}

interface IdleDbOptions {
  lastSettleAt?: Date | string | null;
  produced?: number | null;
  counter?: number;
}

function idleDb(opts: IdleDbOptions = {}): FakeDatabase {
  const anchorRows =
    opts.lastSettleAt === undefined
      ? []
      : [{ last_settle_at: opts.lastSettleAt }];
  return new FakeDatabase()
    .on(/SELECT last_settle_at FROM characters WHERE id = \$1/, { rows: anchorRows })
    .on(/SELECT items_produced FROM game_idle_counters/, {
      rows: opts.produced == null ? [] : [{ items_produced: opts.produced }],
    })
    .on(/INSERT INTO game_idle_counters/, { rows: [{ items_produced: opts.counter ?? 0 }] })
    .on(/UPDATE characters SET last_settle_at/, { rows: [] });
}

function failingCode(res: { success: boolean; data?: unknown }): string | undefined {
  return (res.data as { code?: string } | undefined)?.code;
}

function floorOf(floor: number, overrides: Partial<ZoneIdleFloor> = {}): ZoneIdleFloor {
  return {
    floor,
    unitCode: 'u' + floor,
    isBoss: false,
    floorRequirement: 100 + (floor - 1) * 50,
    lingyunBonusFlat: floor * 10,
    tierOffsetBonus: 0,
    dropDrawBonus: 0,
    ...overrides,
  };
}

/** 默认 3 层整轮计划（第 3 层是 Boss）。 */
function makePlan(overrides: Partial<ZoneIdlePlan> = {}): ZoneIdlePlan {
  return {
    zoneCode: 'z1',
    zoneName: '秘境一',
    realm: 3,
    maxFloor: 3,
    floors: [floorOf(1), floorOf(2), floorOf(3, { unitCode: 'boss1', isBoss: true, lingyunBonusFlat: 30, dropDrawBonus: 3 })],
    ...overrides,
  };
}

// ===== status =====

describe('IdleService.status 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: idleDb(), character: null });
    assert.equal(failingCode(await svc.status(7)), 'CHARACTER_NOT_FOUND');
  });

  test('last_settle_at 为空 -> 视为现在，预计收益 0', async () => {
    const db = idleDb({ lastSettleAt: null, produced: 0 });
    const data = (await makeService({ db }).svc.status(7)).data as {
      pendingHours: number;
      effectiveHours: number;
      estimatedKills: number;
      estimatedLingyun: number;
      dailyItemsProduced: number;
      dailyItemCap: number;
      config: { maxOfflineHours: number };
    };
    assert.equal(data.estimatedKills, 0);
    assert.equal(data.estimatedLingyun, 0);
    assert.ok(data.pendingHours >= 0);
    assert.equal(data.dailyItemsProduced, 0);
    assert.equal(data.dailyItemCap, APP_CONFIG.idleDailyItemCap);
    assert.deepEqual(data.config, {
      roundsPerHour: APP_CONFIG.idleRoundsPerHour,
      efficiencyPct: APP_CONFIG.idleEfficiencyPct,
      maxOfflineHours: APP_CONFIG.idleMaxOfflineHours,
    });
  });

  test('离线恰好 idleMaxOfflineHours -> 不截断，kills=hours×rounds×eff%', async () => {
    const db = idleDb({ lastSettleAt: new Date(Date.now() - APP_CONFIG.idleMaxOfflineHours * 3_600_000), produced: 0 });
    const data = (await makeService({ db }).svc.status(7)).data as { effectiveHours: number; estimatedKills: number; estimatedLingyun: number };
    const expectedKills = Math.floor(
      (APP_CONFIG.idleMaxOfflineHours * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100,
    );
    assert.equal(data.estimatedKills, expectedKills);
    assert.equal(data.effectiveHours, Math.round(APP_CONFIG.idleMaxOfflineHours * APP_CONFIG.idleEfficiencyPct) / 100);
    assert.equal(data.estimatedLingyun, realmLingyun(3) * expectedKills);
  });

  test('离线超出上限（24h）-> 截断到 idleMaxOfflineHours', async () => {
    const db = idleDb({ lastSettleAt: new Date(Date.now() - 24 * 3_600_000), produced: 7 });
    const data = (await makeService({ db }).svc.status(7)).data as { estimatedKills: number; dailyItemsProduced: number };
    assert.equal(
      data.estimatedKills,
      Math.floor((APP_CONFIG.idleMaxOfflineHours * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100),
    );
    assert.equal(data.dailyItemsProduced, 7);
  });
});

// ===== settle: 参数与时长边界 =====

describe('IdleService.settle 时长/参数边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: idleDb(), character: null });
    assert.equal(failingCode(await svc.settle(7)), 'CHARACTER_NOT_FOUND');
  });

  test('hoursOverride 边界：-1 / NaN / Infinity / 10001 -> INVALID_PARAM 且无 DB', async () => {
    for (const hours of [-1, Number.NaN, Number.POSITIVE_INFINITY, 10001]) {
      const db = idleDb();
      const { svc } = makeService({ db });
      assert.equal(failingCode(await svc.settle(7, 'slime', hours)), 'INVALID_PARAM', 'hours=' + String(hours));
      assert.equal(db.callCount, 0);
    }
  });

  test('hoursOverride=0 -> 合法（不早退），settleKills count=0', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub } = makeService({ db });
    const res = await svc.settle(7, 'slime', 0);
    assert.equal(res.success, true);
    assert.equal((res.data as { kills: number }).kills, 0);
    assert.equal(unitStub.settleKills.callCount, 1);
    assert.deepEqual(unitStub.settleKills.last?.[2], 0);
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 1);
  });

  test('hoursOverride=1.5 -> kills=floor(hours×rounds×eff%)', async () => {
    const db = idleDb({ produced: 0, counter: 3 });
    const { svc, unitStub } = makeService({ db });
    await svc.settle(7, 'slime', 1.5);
    const expected = Math.floor((1.5 * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100);
    assert.equal(unitStub.settleKills.last?.[2], expected);
  });

  test('hoursOverride=10000（上界）-> 按 idleMaxOfflineHours 截断', async () => {
    const db = idleDb({ produced: 0, counter: 4 });
    const { svc, unitStub } = makeService({ db });
    await svc.settle(7, 'slime', 10000);
    assert.equal(
      unitStub.settleKills.last?.[2],
      Math.floor((APP_CONFIG.idleMaxOfflineHours * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100),
    );
  });

  test('hoursOverride=12 -> effectiveHours 用于展示，kills 正确', async () => {
    const db = idleDb({ produced: 0, counter: 5 });
    const { svc, unitStub } = makeService({ db });
    const res = await svc.settle(7, 'slime', 12);
    assert.equal((res.data as { effectiveHours: number }).effectiveHours, Math.round(12 * APP_CONFIG.idleEfficiencyPct) / 100);
    assert.equal(
      unitStub.settleKills.last?.[2],
      Math.floor((12 * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100),
    );
  });

  test('生产环境：合法 override -> FORBIDDEN；非法 override -> 先 INVALID_PARAM；无 override -> 正常结算', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const forbiddenDb = idleDb();
      assert.equal(failingCode(await makeService({ db: forbiddenDb }).svc.settle(7, 'slime', 1)), 'FORBIDDEN');
      assert.equal(forbiddenDb.callCount, 0);

      const invalidDb = idleDb();
      assert.equal(failingCode(await makeService({ db: invalidDb }).svc.settle(7, 'slime', 10001)), 'INVALID_PARAM');
      assert.equal(invalidDb.callCount, 0);

      const okDb = idleDb({ lastSettleAt: new Date(Date.now() - 2 * 3_600_000), produced: 0, counter: 1 });
      const res = await makeService({ db: okDb }).svc.settle(7, 'slime');
      assert.equal(res.success, true);
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });
});

// ===== settle: 早退与离线时长 =====

describe('IdleService.settle 早退与离线时长边界', () => {
  test('无 override 且 kills=0 -> 早退：不调用 settleKills、不写计数、不刷新锚点', async () => {
    const db = idleDb({ lastSettleAt: new Date(), produced: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db });
    const res = await svc.settle(7, 'slime');
    assert.equal(res.success, true);
    assert.match(res.message, /暂无可结算收益/);
    assert.equal((res.data as { kills: number }).kills, 0);
    assert.equal(unitStub.settleKills.callCount, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_idle_counters/).length, 0);
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 0);
    // §22 Q6：互斥闸门**先于**早退（闸门查一次；不在战斗 → 放行到早退分支）
    assert.equal(zoneStub.inOnlineBattle.callCount, 1);
  });

  test('无 override、锚点 24h -> 截断后正常结算', async () => {
    const db = idleDb({ lastSettleAt: new Date(Date.now() - 24 * 3_600_000), produced: 0, counter: 10 });
    const { svc, unitStub } = makeService({ db });
    const res = await svc.settle(7, 'slime');
    assert.equal(res.success, true);
    assert.equal(
      unitStub.settleKills.last?.[2],
      Math.floor((APP_CONFIG.idleMaxOfflineHours * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100),
    );
    assert.equal((res.data as { dailyItemsProduced: number }).dailyItemsProduced, 10);
  });
});

// ===== settle: 每日物品上限 =====

describe('IdleService.settle 每日物品上限边界', () => {
  test('已产出=cap（恰好用尽）-> itemBudget=0', async () => {
    const db = idleDb({ produced: APP_CONFIG.idleDailyItemCap, counter: APP_CONFIG.idleDailyItemCap });
    const { svc, unitStub } = makeService({ db });
    await svc.settle(7, 'slime', 1);
    assert.equal((unitStub.settleKills.last?.[3] as { itemBudget: number }).itemBudget, 0);
  });

  test('已产出=cap+1（超出）-> itemBudget 归零不为负', async () => {
    const db = idleDb({ produced: APP_CONFIG.idleDailyItemCap + 1, counter: APP_CONFIG.idleDailyItemCap + 1 });
    const { svc, unitStub } = makeService({ db });
    await svc.settle(7, 'slime', 1);
    assert.equal((unitStub.settleKills.last?.[3] as { itemBudget: number }).itemBudget, 0);
  });

  test('已产出=cap-1 -> itemBudget=1', async () => {
    const db = idleDb({ produced: APP_CONFIG.idleDailyItemCap - 1, counter: APP_CONFIG.idleDailyItemCap });
    const { svc, unitStub } = makeService({ db });
    await svc.settle(7, 'slime', 1);
    assert.equal((unitStub.settleKills.last?.[3] as { itemBudget: number }).itemBudget, 1);
  });

  test('dailyItemsProduced 取计数表 RETURNING 值', async () => {
    const db = idleDb({ produced: 5, counter: 205 });
    const { svc } = makeService({ db });
    const res = await svc.settle(7, 'slime', 1);
    assert.equal((res.data as { dailyItemsProduced: number }).dailyItemsProduced, 205);
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 1);
  });
});

// ===== settle: 挂机点与「循环整轮」分摊（§22 / §23 A3） =====

describe('IdleService.settle 挂机点与单位来源边界（§22）', () => {
  test('unitCode 为空/纯空白 -> 走挂机点整轮计划，并在 data.zone 回填秘境', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, zoneStub } = makeService({ db, plan: makePlan() });
    const res = await svc.settle(7, '   ', 1);
    assert.equal(res.success, true);
    assert.deepEqual((res.data as { zone: unknown }).zone, { code: 'z1', name: '秘境一', maxFloor: 3 });
    assert.equal(zoneStub.idlePlan.callCount, 1);
    assert.deepEqual(zoneStub.idlePlan.last, [11]);
  });

  test('unitCode 显式给出 -> 跳过挂机点逻辑（调试单单位路径），data.zone=null、floors=[]', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db, plan: makePlan() });
    const res = await svc.settle(7, 'slime', 1);
    assert.equal(res.success, true);
    assert.equal(zoneStub.idlePlan.callCount, 0, '显式 unitCode 不得查挂机点');
    assert.equal(zoneStub.inOnlineBattle.callCount, 1, '互斥闸门与 unitCode 无关，始终查询');
    assert.equal((res.data as { zone: unknown }).zone, null);
    assert.deepEqual((res.data as { floors: unknown[] }).floors, []);
    assert.equal(unitStub.settleKills.callCount, 1);
    assert.equal(unitStub.settleKills.last?.[1], 'slime');
  });

  test('挂机点缺失（idlePlan=null）-> IDLE_TARGET_NOT_SET，不结算、不写库', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db, plan: null });
    const res = await svc.settle(7, undefined, 1);
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'IDLE_TARGET_NOT_SET');
    assert.match(res.message, /尚未设置挂机点/);
    assert.deepEqual(zoneStub.idlePlan.last, [11]);
    assert.equal(unitStub.settleKills.callCount, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_idle_counters/).length, 0);
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 0);
  });

  test('挂机点不可挂机（未突破 / 特训，同样收敛为 idlePlan=null）-> 同 IDLE_TARGET_NOT_SET', async () => {
    // zone 域把「没设挂机点」与「不再满足挂机资格（未突破 / idle_allowed=false）」都收敛成
    // idlePlan=null，idle 域只认这一个 null，不区分原因（§22 §6.2）。
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc } = makeService({ db, plan: null });
    assert.equal(failingCode(await svc.settle(7, undefined, 1)), 'IDLE_TARGET_NOT_SET');
  });

  test('settleKills 失败 -> 原样返回失败结果', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub } = makeService({ db, settle: { ok: false, result: fail('UNIT_NOT_FOUND', '单位不存在') } });
    const res = await svc.settle(7, 'slime', 1);
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'UNIT_NOT_FOUND');
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 0);
    assert.equal(unitStub.settleKills.callCount, 1);
  });
});

describe('IdleService.settle A3 循环整轮（逐层分摊 + 聚合）', () => {
  /** 逐层返回不同的结算体，便于断言"第 i 层用的是第 i 层的加成"。 */
  function perFloorSeq(): SettleResult[] {
    return ['u1', 'u2', 'boss1'].map((code, index) => {
      const floor = index + 1;
      return okSettle({
        unit: { code, name: '单位' + floor, realm: 3 },
        kills: 1,
        lingyunGained: floor * 100,
        lingyunTotal: 100 + floor * 100,
        itemsProduced: floor,
        kept: floor,
      });
    });
  }

  test('3 层各结算一次：单位/层灵韵/掉落档逐层取计划值，调用顺序为 1→2→3', async () => {
    const db = idleDb({ produced: 0, counter: 6 });
    const { svc, unitStub } = makeService({ db, plan: makePlan(), settleSeq: perFloorSeq() });
    const res = await svc.settle(7, undefined, 1);
    assert.equal(res.success, true);
    // 1 小时 × 60 轮/时 × 60% = 36 击杀 / 3 层 -> 每层 12
    const kills = Math.floor((1 * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100);
    assert.equal(kills, 36, '前置假设：1 小时 → 36 击杀');
    assert.equal(unitStub.settleKills.callCount, 3);
    assert.deepEqual(
      unitStub.settleKills.calls.map((c) => [c[1], c[2], (c[3] as { lingyunBonusFlat: number }).lingyunBonusFlat, (c[3] as { dropDrawBonus: number }).dropDrawBonus]),
      [
        ['u1', 12, 10, 0],
        ['u2', 12, 20, 0],
        ['boss1', 12, 30, 3],
      ],
    );
    assert.deepEqual((res.data as { floors: unknown[] }).floors, [
      { floor: 1, unitCode: 'u1', unitName: '单位1', isBoss: false, kills: 12 },
      { floor: 2, unitCode: 'u2', unitName: '单位2', isBoss: false, kills: 12 },
      { floor: 3, unitCode: 'boss1', unitName: '单位3', isBoss: true, kills: 12 },
    ]);
    // 聚合：数值累加 / lingyunTotal 取末次 / items 拼接
    const data = res.data as {
      kills: number;
      lingyunGained: number;
      lingyunTotal: number;
      itemsProduced: number;
      kept: number;
      items: unknown[];
    };
    assert.equal(data.kills, 36);
    assert.equal(data.lingyunGained, 600);
    assert.equal(data.lingyunTotal, 400, 'lingyunTotal 取最后一次调用的权威余额');
    assert.equal(data.itemsProduced, 6);
    assert.equal(data.kept, 6);
  });

  test('kills=1（不足 3 层）-> 只打第 1 层，不白送第 2/3 层的层灵韵', async () => {
    // hoursOverride 让 kills 精确可控：1 小时 × 60 轮 × 60% = 36... 用极小值构造 kills=1 不可行，
    // 因此直接断言分摊函数与「0 杀层不调用」的组合行为：用 maxFloor=3 + 1 小时（60 杀）= 20/层，
    // 再用 hoursOverride=0.01 → floor(0.01*60*0.6)=0（早退）；因此用 0.05 → floor(1.8)=1。
    const db = idleDb({ produced: 0, counter: 1 });
    const { svc, unitStub } = makeService({
      db,
      plan: makePlan(),
      settleSeq: [okSettle({ unit: { code: 'u1', name: '单位1', realm: 3 }, kills: 1, itemsProduced: 0 })],
    });
    const res = await svc.settle(7, undefined, 0.05);
    assert.equal(res.success, true);
    assert.equal(unitStub.settleKills.callCount, 1, 'kills=1 只结第 1 层');
    assert.deepEqual(unitStub.settleKills.calls.map((c) => [c[1], c[2]]), [['u1', 1]]);
    assert.deepEqual(
      (res.data as { floors: { floor: number; kills: number }[] }).floors.map((f) => [f.floor, f.kills]),
      [[1, 1]],
    );
  });

  test('kills 与层数不整除（7 杀 / 3 层）-> [3,2,2]，余数给前 rest 层', async () => {
    const db = idleDb({ produced: 0, counter: 1 });
    const { svc, unitStub } = makeService({
      db,
      plan: makePlan(),
      settleSeq: [okSettle(), okSettle(), okSettle()],
    });
    const res = await svc.settle(7, undefined, 0.2); // floor(0.2*60*0.6)=7
    assert.equal(res.success, true);
    assert.deepEqual(unitStub.settleKills.calls.map((c) => c[2]), [3, 2, 2]);
    assert.deepEqual(
      (res.data as { floors: { kills: number }[] }).floors.map((f) => f.kills),
      [3, 2, 2],
    );
    assert.equal((res.data as { kills: number }).kills, 7, 'kills 用整轮总数而非单层数');
  });

  test('maxFloor=1（单层秘境）-> 退化为单层：只调一次且 kills 全给第 1 层', async () => {
    const db = idleDb({ produced: 0, counter: 1 });
    const { svc, unitStub } = makeService({ db, plan: makePlan({ maxFloor: 1, floors: [floorOf(1)] }) });
    const res = await svc.settle(7, undefined, 0.2); // 7 杀
    assert.equal(res.success, true);
    assert.equal(unitStub.settleKills.callCount, 1);
    assert.deepEqual(unitStub.settleKills.calls.map((c) => [c[1], c[2]]), [['u1', 7]]);
    assert.deepEqual((res.data as { zone: unknown }).zone, { code: 'z1', name: '秘境一', maxFloor: 1 });
  });

  test('每日预算中途耗尽 -> 第 1 层用尽剩余额度、后几层 itemBudget=0，仍照常结算灵韵/通货/精华', async () => {
    const db = idleDb({ produced: APP_CONFIG.idleDailyItemCap - 2, counter: APP_CONFIG.idleDailyItemCap });
    const { svc, unitStub } = makeService({
      db,
      plan: makePlan(),
      // 第 1 层拿到全部剩余预算 2 件并用满
      settleSeq: [
        okSettle({ unit: { code: 'u1', name: '单位1', realm: 3 }, itemsProduced: 2, lingyunGained: 100 }),
        okSettle({ unit: { code: 'u2', name: '单位2', realm: 3 }, itemsProduced: 0, lingyunGained: 200, currencies: { chaos: 1 } }),
        okSettle({ unit: { code: 'boss1', name: '单位3', realm: 3 }, itemsProduced: 0, lingyunGained: 300, essences: { e1: 2 } }),
      ],
    });
    const res = await svc.settle(7, undefined, 1);
    assert.equal(res.success, true);
    assert.deepEqual(
      unitStub.settleKills.calls.map((c) => (c[3] as { itemBudget: number }).itemBudget),
      [2, 0, 0],
      '额度逐层递减：第 1 层 2，之后归零且不为负',
    );
    const data = res.data as { lingyunGained: number; currencies: Record<string, number>; essences: Record<string, number> };
    assert.equal(data.lingyunGained, 600);
    assert.deepEqual(data.currencies, { chaos: 1 });
    assert.deepEqual(data.essences, { e1: 2 });
    assert.equal(db.callsMatching(/INSERT INTO game_idle_counters/).length, 1);
  });

  test('聚合口径：salvaged/sold 逐字段相加、currencies/essences 按 key 累加', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc } = makeService({
      db,
      plan: makePlan(),
      settleSeq: [
        okSettle({ salvaged: { count: 1, lingyun: 10 }, sold: { count: 2, spiritStones: 20 }, currencies: { a: 1, b: 1 } }),
        okSettle({ salvaged: { count: 3, lingyun: 30 }, sold: { count: 4, spiritStones: 40 }, currencies: { a: 2 }, essences: { e: 5 } }),
        okSettle({ salvaged: { count: 5, lingyun: 50 }, sold: { count: 6, spiritStones: 60 }, essences: { e: 1, f: 2 } }),
      ],
    });
    const res = await svc.settle(7, undefined, 1);
    const data = res.data as {
      salvaged: { count: number; lingyun: number };
      sold: { count: number; spiritStones: number };
      currencies: Record<string, number>;
      essences: Record<string, number>;
    };
    assert.deepEqual(data.salvaged, { count: 9, lingyun: 90 });
    assert.deepEqual(data.sold, { count: 12, spiritStones: 120 });
    assert.deepEqual(data.currencies, { a: 3, b: 1 });
    assert.deepEqual(data.essences, { e: 6, f: 2 });
  });

  test('中途失败 -> 原样返回失败、不刷新锚点、不写计数（已知取舍由本用例钉住）', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub } = makeService({
      db,
      plan: makePlan(),
      settleSeq: [okSettle(), { ok: false, result: fail('NOT_KILLABLE', '非敌对单位') }],
    });
    const res = await svc.settle(7, undefined, 1);
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'NOT_KILLABLE');
    assert.equal(unitStub.settleKills.callCount, 2, '第 1 层已结算、第 2 层失败即中止');
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_idle_counters/).length, 0);
  });

  test('不写 game_zone_progress（不变式 1：离线时间不换进度）', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc } = makeService({ db, plan: makePlan(), settleSeq: [okSettle(), okSettle(), okSettle()] });
    await svc.settle(7, undefined, 1);
    assert.equal(db.callsMatching(/game_zone_progress/).length, 0);
  });
});

// ===== §22 Q6：在线战斗互斥闸门（game_zone_state 有行 ⇒ 离线挂机暂停） =====

describe('IdleService.settle 在线互斥闸门边界（§22 Q6）', () => {
  test('在线战斗中 -> ONLINE_BATTLE_ACTIVE：不结算、不写计数、不刷新锚点', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db, inBattle: true });
    const res = await svc.settle(7, 'slime', 1);
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'ONLINE_BATTLE_ACTIVE');
    assert.match(res.message, /在线战斗/);
    assert.deepEqual(zoneStub.inOnlineBattle.last, [11]);
    assert.equal(unitStub.settleKills.callCount, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_idle_counters/).length, 0);
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 0);
  });

  test('不在线（game_zone_state 无行）-> 闸门放行，正常结算', async () => {
    const db = idleDb({ produced: 0, counter: 1 });
    const { svc, zoneStub } = makeService({ db, inBattle: false });
    const res = await svc.settle(7, 'slime', 1);
    assert.equal(res.success, true);
    assert.equal(zoneStub.inOnlineBattle.callCount, 1);
  });

  test('顺序：闸门**先于**「暂无可结算收益」—— 在线 + 离线 0 秒也报 ONLINE_BATTLE_ACTIVE', async () => {
    // 真后端 e2e 抓到的顺序缺陷：旧顺序会回「暂无可结算收益」，那句话既不真（真正原因是
    // 战斗中）也不解决问题。状态闸门必须先于数量判断。
    const db = idleDb({ lastSettleAt: new Date(), produced: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db, inBattle: true });
    const res = await svc.settle(7, 'slime');
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'ONLINE_BATTLE_ACTIVE');
    assert.equal(zoneStub.inOnlineBattle.callCount, 1);
    // 闸门拦下后完全不结算、不触达挂机点
    assert.equal(unitStub.settleKills.callCount, 0);
    assert.equal(zoneStub.idlePlan.callCount, 0);
  });

  test('顺序：参数校验仍先于闸门（非法 hours 不因为在线而改变失败码）', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, zoneStub } = makeService({ db, inBattle: true });
    assert.equal(failingCode(await svc.settle(7, 'slime', -1)), 'INVALID_PARAM');
    assert.equal(zoneStub.inOnlineBattle.callCount, 0, '参数非法时不应触达闸门');
  });

  test('顺序：hoursOverride=0 不会早退 -> 在线时闸门照常生效', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub } = makeService({ db, inBattle: true });
    assert.equal(failingCode(await svc.settle(7, 'slime', 0)), 'ONLINE_BATTLE_ACTIVE');
    assert.equal(unitStub.settleKills.callCount, 0);
  });
});
