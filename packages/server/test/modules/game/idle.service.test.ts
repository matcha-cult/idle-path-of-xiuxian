import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IdleService } from '../../../src/modules/logic/idle/internal/idle.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { fail } from '../../../src/common/kernel/result.js';
import type { SettleResult, SettlementData } from '../../../src/modules/logic/combat/combat.api.js';
import type { ZoneEncounter } from '../../../src/modules/logic/zone/internal/zone.service.js';
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
  encounter?: ZoneEncounter | null;
  settle?: SettleResult;
  /** §22 Q6：是否在线战斗中（game_zone_state 有行）。缺省 false。 */
  inBattle?: boolean;
}) {
  const character = opts.character === undefined ? makeChar() : opts.character;
  const charStub = { findByUserId: stub(async () => character) };
  const unitStub = { settleKills: stub(async () => opts.settle ?? okSettle()) };
  // §22：zone 域供 idle 域复用的两个挂钩。缺省：不在线、无挂机点。
  // 挂机点「缺失」与「不可挂机」在 zone 域都收敛成 idleEncounter=null，这里一并模拟。
  const zoneStub = {
    inOnlineBattle: stub(async () => opts.inBattle ?? false),
    idleEncounter: stub(async () => opts.encounter ?? null),
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

const ENCOUNTER: ZoneEncounter = { zoneCode: 'z1', zoneName: '秘境一', floor: 2, isBoss: false, unitCode: 'mob' };

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
  test('无 override 且 kills=0 -> 早退：不调用 settleKills、不写计数、不刷新锚点、不触达互斥闸门', async () => {
    const db = idleDb({ lastSettleAt: new Date(), produced: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db });
    const res = await svc.settle(7, 'slime');
    assert.equal(res.success, true);
    assert.match(res.message, /暂无可结算收益/);
    assert.equal((res.data as { kills: number }).kills, 0);
    assert.equal(unitStub.settleKills.callCount, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_idle_counters/).length, 0);
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 0);
    // §22 Q6 顺序：早退信封在互斥闸门之前，离线 0 秒不应去查在线状态
    assert.equal(zoneStub.inOnlineBattle.callCount, 0);
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

// ===== settle: 挂机点与单位来源（§22） =====

describe('IdleService.settle 挂机点与单位来源边界（§22）', () => {
  test('unitCode 为空/纯空白 -> 回落到挂机点遭遇单位，并在 data.zone 回填', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db, encounter: ENCOUNTER });
    const res = await svc.settle(7, '   ', 1);
    assert.equal(res.success, true);
    assert.equal(unitStub.settleKills.last?.[1], 'mob');
    assert.deepEqual((res.data as { zone: unknown }).zone, {
      code: 'z1',
      name: '秘境一',
      floor: 2,
      isBoss: false,
    });
    assert.equal(zoneStub.idleEncounter.callCount, 1);
    assert.deepEqual(zoneStub.idleEncounter.last, [11]);
  });

  test('unitCode 显式给出 -> 跳过挂机点逻辑，data.zone=null（互斥闸门仍会查询）', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, zoneStub } = makeService({ db, encounter: ENCOUNTER });
    const res = await svc.settle(7, 'slime', 1);
    assert.equal(res.success, true);
    assert.equal(zoneStub.idleEncounter.callCount, 0, '显式 unitCode 不得查挂机点');
    assert.equal(zoneStub.inOnlineBattle.callCount, 1, '互斥闸门与 unitCode 无关，始终查询');
    assert.equal((res.data as { zone: unknown }).zone, null);
  });

  test('挂机点缺失（idleEncounter=null）-> IDLE_TARGET_NOT_SET，不结算、不写库', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub, zoneStub } = makeService({ db, encounter: null });
    const res = await svc.settle(7, undefined, 1);
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'IDLE_TARGET_NOT_SET');
    assert.match(res.message, /尚未设置挂机点/);
    assert.deepEqual(zoneStub.idleEncounter.last, [11]);
    assert.equal(unitStub.settleKills.callCount, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_idle_counters/).length, 0);
    assert.equal(db.callsMatching(/UPDATE characters SET last_settle_at/).length, 0);
  });

  test('挂机点不可挂机（未突破 / 特训，同样收敛为 idleEncounter=null）-> 同 IDLE_TARGET_NOT_SET', async () => {
    // zone 域把「没设挂机点」与「不再满足挂机资格（未突破 / idle_allowed=false）」都收敛成
    // idleEncounter=null，idle 域只认这一个 null，不区分原因（§22 §6.2）。
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc } = makeService({ db, encounter: null });
    assert.equal(failingCode(await svc.settle(7, undefined, 1)), 'IDLE_TARGET_NOT_SET');
  });

  test('挂机点可用且为 Boss 层 -> 用 encounter 单位结算并回填 zone（挂机打已突破秘境的最深层）', async () => {
    const boss: ZoneEncounter = {
      zoneCode: 'z_hundun',
      zoneName: '混沌秘境',
      floor: 10,
      isBoss: true,
      unitCode: 'u_r13_feishengmo',
    };
    const db = idleDb({ produced: 0, counter: 2 });
    const { svc, unitStub } = makeService({ db, encounter: boss });
    const res = await svc.settle(7, undefined, 1);
    assert.equal(res.success, true);
    assert.equal(unitStub.settleKills.last?.[1], 'u_r13_feishengmo');
    assert.deepEqual((res.data as { zone: unknown }).zone, {
      code: 'z_hundun',
      name: '混沌秘境',
      floor: 10,
      isBoss: true,
    });
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

  test('顺序：无 override 且 kills=0 的「暂无可结算收益」先于闸门（在线也不报错、不触达闸门）', async () => {
    const db = idleDb({ lastSettleAt: new Date(), produced: 0 });
    const { svc, zoneStub } = makeService({ db, inBattle: true });
    const res = await svc.settle(7, 'slime');
    assert.equal(res.success, true);
    assert.match(res.message, /暂无可结算收益/);
    assert.equal(zoneStub.inOnlineBattle.callCount, 0, '早退分支之后才是闸门');
  });

  test('顺序：hoursOverride=0 不会早退 -> 在线时闸门照常生效', async () => {
    const db = idleDb({ produced: 0, counter: 0 });
    const { svc, unitStub } = makeService({ db, inBattle: true });
    assert.equal(failingCode(await svc.settle(7, 'slime', 0)), 'ONLINE_BATTLE_ACTIVE');
    assert.equal(unitStub.settleKills.callCount, 0);
  });
});
