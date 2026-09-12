import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ZoneService } from '../../../src/modules/logic/zone/internal/zone.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { fail } from '../../../src/modules/logic/zone/internal/zone.types.js';
import type { SettleResult } from '../../../src/modules/game/unit/unit.service.js';
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

function zoneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: 'z1',
    name: '秘境一',
    chapter: 1,
    order_index: 1,
    min_realm: 1,
    unit_code: 'u1',
    boss_code: 'boss1',
    base_power: 100,
    power_step: 50,
    max_floor: 3,
    lingyun_bonus_per_floor: 10,
    boss_every_floors: 3,
    require_prev_best_floor: 0,
    tier_bonus_every_floors: 2,
    drop_bonus_every_floors: 2,
    ...overrides,
  };
}

function okSettle(): SettleResult {
  return {
    ok: true,
    data: {
      unit: { code: 'u1', name: '单位', realm: 1 },
      kills: 1,
      lingyunGained: 5,
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
    },
  };
}

function makeService(opts: { db: FakeDatabase; character?: Character | null; settle?: SettleResult }) {
  const character = opts.character === undefined ? makeChar() : opts.character;
  const charStub = { findByUserId: stub(async () => character) };
  const unitStub = { settleKills: stub(async () => opts.settle ?? okSettle()) };
  const svc = new ZoneService(opts.db as never, charStub as never, unitStub as never);
  return { svc, charStub, unitStub };
}

interface ZoneDbOptions {
  zones?: Array<Record<string, unknown>>;
  progress?: Array<Record<string, unknown>>;
  state?: Array<Record<string, unknown>>;
  equip?: string | null;
  skill?: string | null;
  byCode?: Array<Record<string, unknown>>;
  byId?: Array<Record<string, unknown>>;
  oneProgress?: Array<Record<string, unknown>>;
}

function zoneDb(opts: ZoneDbOptions = {}): FakeDatabase {
  return new FakeDatabase()
    .on(/FROM game_zones ORDER BY order_index, id/, { rows: opts.zones ?? [] })
    .on(/FROM game_zones WHERE code = \$1/, { rows: opts.byCode ?? [] })
    .on(/FROM game_zones WHERE id = \$1/, { rows: opts.byId ?? [] })
    .on(/FROM game_zone_state WHERE character_id = \$1/, { rows: opts.state ?? [] })
    .on(/FROM game_zone_progress WHERE character_id = \$1 AND zone_id = \$2/, { rows: opts.oneProgress ?? [] })
    .on(/FROM game_zone_progress WHERE character_id = \$1$/, { rows: opts.progress ?? [] })
    .on(/COUNT\(\*\)::text AS c FROM game_items/, { rows: opts.equip == null ? [] : [{ c: opts.equip }] })
    .on(/COALESCE\(SUM\(level\), 0\)::text AS s/, { rows: opts.skill == null ? [] : [{ s: opts.skill }] });
}

function failingCode(res: { success: boolean; data?: unknown }): string | undefined {
  return (res.data as { code?: string } | undefined)?.code;
}

// ===== 战力 =====

describe('ZoneService.playerPower 边界', () => {
  test('装备数 0 / 功法等级 0（无行）-> 仅 realm 权重', async () => {
    const db = zoneDb({});
    const { svc } = makeService({ db });
    const power = await svc.playerPower(11, 4);
    assert.equal(power, 4 * APP_CONFIG.zonePower.realmWeight);
  });

  test('装备/功法权重边界：skillSum=0/1/2/3', async () => {
    const cases: Array<[string, number]> = [
      ['0', 0],
      ['1', 0],
      ['2', 1],
      ['3', 1],
    ];
    for (const [skill, expected] of cases) {
      const db = zoneDb({ equip: '3', skill });
      const { svc } = makeService({ db });
      const power = await svc.playerPower(11, 4);
      assert.equal(
        power,
        4 * APP_CONFIG.zonePower.realmWeight + 3 * APP_CONFIG.zonePower.equipWeight + expected,
        'skill=' + skill,
      );
    }
  });

  test('小数功法等级 -> 先 floor 再进权重', async () => {
    const db = zoneDb({ equip: '0', skill: '3.5' });
    const { svc } = makeService({ db });
    const power = await svc.playerPower(11, 2);
    assert.equal(power, 2 * APP_CONFIG.zonePower.realmWeight + 1);
  });

  test('realm=0 / 非法数值 -> 按数学运算透传（NaN）', async () => {
    const zero = zoneDb({ equip: '0', skill: '0' });
    assert.equal(await makeService({ db: zero }).svc.playerPower(11, 0), 0);

    const bad = zoneDb({ equip: '0', skill: 'abc' });
    const power = await makeService({ db: bad }).svc.playerPower(11, 1);
    assert.ok(Number.isNaN(power));
  });
});

// ===== 图鉴 =====

describe('ZoneService.catalog 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.catalog(7)), 'CHARACTER_NOT_FOUND');
  });

  test('无秘境 -> total=0 / currentZone=null', async () => {
    const db = zoneDb({ zones: [], state: [] });
    const { svc } = makeService({ db });
    const data = (await svc.catalog(7)).data as { total: number; currentZone: string | null; zones: unknown[] };
    assert.equal(data.total, 0);
    assert.equal(data.currentZone, null);
  });

  test('多秘境 -> unlockedReason realm/prev 与 current 标记正确', async () => {
    const z1 = zoneRow({ id: 1, code: 'z1', order_index: 1, min_realm: 1 });
    const z2 = zoneRow({ id: 2, code: 'z2', order_index: 2, min_realm: 5 });
    const z3 = zoneRow({ id: 3, code: 'z3', order_index: 3, min_realm: 1, require_prev_best_floor: 2 });
    const db = zoneDb({
      zones: [z1, z2, z3],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 2, best_floor: 1, cleared: false }],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 3 }) });
    const data = (await svc.catalog(7)).data as {
      total: number;
      playerPower: number;
      currentZone: string | null;
      zones: Array<{ code: string; unlocked: boolean; unlockedReason: string; prevZone: string | null; prevBestFloor: number; current: boolean }>;
    };
    assert.equal(data.total, 3);
    assert.equal(data.playerPower, 3 * APP_CONFIG.zonePower.realmWeight);
    assert.equal(data.currentZone, 'z1');
    assert.deepEqual(
      data.zones.map((z) => [z.code, z.unlocked, z.unlockedReason, z.prevZone, z.prevBestFloor, z.current]),
      [
        ['z1', true, 'ok', null, 0, true],
        ['z2', false, 'realm', null, 0, false],
        ['z3', false, 'prev', 'z2', 0, false],
      ],
    );
  });
});

// ===== 进度 =====

describe('ZoneService.progress 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.progress(7)), 'CHARACTER_NOT_FOUND');
  });

  test('当前秘境为空 -> ZONE_NOT_FOUND（暂无可用秘境）', async () => {
    const db = zoneDb({ zones: [], state: [] });
    const { svc } = makeService({ db });
    const res = await svc.progress(7);
    assert.equal(failingCode(res), 'ZONE_NOT_FOUND');
    assert.match(res.message, /暂无可用秘境/);
  });

  test('state 指向已不存在的秘境 -> ZONE_NOT_FOUND（秘境不存在）', async () => {
    const db = zoneDb({ zones: [], state: [{ id: 1, character_id: 11, current_zone_id: 999 }] });
    const { svc } = makeService({ db });
    const res = await svc.progress(7);
    assert.equal(failingCode(res), 'ZONE_NOT_FOUND');
    assert.match(res.message, /秘境不存在/);
  });

  test('无进度行 -> 默认 floor=1 / bestFloor=0 / cleared=false', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      progress: [],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db });
    const data = (await svc.progress(7)).data as {
      floor: number;
      bestFloor: number;
      cleared: boolean;
      floorRequirement: number;
      canChallenge: boolean;
      encounterUnit: string;
    };
    assert.equal(data.floor, 1);
    assert.equal(data.bestFloor, 0);
    assert.equal(data.cleared, false);
    assert.equal(data.floorRequirement, 100);
    assert.equal(data.canChallenge, false); // power 60 < 100
    assert.equal(data.encounterUnit, 'u1');
  });

  test('floor=2 -> 战力门槛 = base + 1×step，恰好达标可挑战', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 2, best_floor: 1, cleared: false }],
      equip: '14',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const data = (await svc.progress(7)).data as {
      floorRequirement: number;
      playerPower: number;
      canChallenge: boolean;
      lingyunBonus: number;
      isBossFloor: boolean;
      dropTierOffset: number;
      extraDropDraws: number;
    };
    assert.equal(data.floorRequirement, 150);
    assert.equal(data.playerPower, 150);
    assert.equal(data.canChallenge, true);
    assert.equal(data.lingyunBonus, 20);
    assert.equal(data.isBossFloor, false);
    assert.equal(data.dropTierOffset, 0);
    assert.equal(data.extraDropDraws, 0);
  });

  test('floor=3（Boss 层）-> 遭遇 Boss、额外掉落含 Boss 加成', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 3, best_floor: 2, cleared: false }],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db });
    const data = (await svc.progress(7)).data as {
      isBossFloor: boolean;
      encounterUnit: string;
      extraDropDraws: number;
      dropTierOffset: number;
      lingyunBonus: number;
    };
    assert.equal(data.isBossFloor, true);
    assert.equal(data.encounterUnit, 'boss1');
    assert.equal(data.dropTierOffset, 1);
    assert.equal(data.extraDropDraws, 1 + APP_CONFIG.zoneBossExtraDraws);
    assert.equal(data.lingyunBonus, 30);
  });
});

// ===== 进入 =====

describe('ZoneService.enter 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.enter(7, 'z1')), 'CHARACTER_NOT_FOUND');
  });

  test('秘境不存在（含空串 code）-> ZONE_NOT_FOUND', async () => {
    for (const code of ['nope', '']) {
      const db = zoneDb({ zones: [], byCode: [] });
      const { svc } = makeService({ db });
      const res = await svc.enter(7, code);
      assert.equal(failingCode(res), 'ZONE_NOT_FOUND');
      assert.deepEqual(db.lastCall(/FROM game_zones WHERE code/)?.params, [code]);
    }
  });

  test('realm=min_realm-1 -> REALM_TOO_LOW；realm=min_realm -> 成功（上界）', async () => {
    const z = zoneRow({ min_realm: 5 });
    const low = zoneDb({ zones: [z], byCode: [z] });
    const lowRes = await makeService({ db: low, character: makeChar({ realm: 4 }) }).svc.enter(7, 'z1');
    assert.equal(failingCode(lowRes), 'REALM_TOO_LOW');
    assert.equal((lowRes.data as { required: number }).required, 5);
    assert.equal((lowRes.data as { current: number }).current, 4);

    const exact = zoneDb({
      zones: [z],
      byCode: [z],
      oneProgress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
    });
    const exactRes = await makeService({ db: exact, character: makeChar({ realm: 5 }) }).svc.enter(7, 'z1');
    assert.equal(exactRes.success, true);
    assert.deepEqual(exact.lastCall(/INSERT INTO game_zone_state/)?.params, [11, 1]);
  });

  test('链式解锁：前置 bestFloor=require-1 锁定，=require 解锁', async () => {
    const z1 = zoneRow({ id: 1, code: 'z1', order_index: 1, min_realm: 1 });
    const z2 = zoneRow({ id: 2, code: 'z2', order_index: 2, min_realm: 1, require_prev_best_floor: 2 });

    const lockedDb = zoneDb({
      zones: [z1, z2],
      byCode: [z2],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 1, cleared: false }],
    });
    const locked = await makeService({ db: lockedDb }).svc.enter(7, 'z2');
    assert.equal(failingCode(locked), 'ZONE_LOCKED');
    assert.deepEqual(
      { prevZone: (locked.data as { prevZone: string }).prevZone, prevBest: (locked.data as { prevBestFloor: number }).prevBestFloor, required: (locked.data as { requiredPrevBestFloor: number }).requiredPrevBestFloor },
      { prevZone: 'z1', prevBest: 1, required: 2 },
    );

    const openDb = zoneDb({
      zones: [z1, z2],
      byCode: [z2],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 2, best_floor: 2, cleared: false }],
      oneProgress: [{ id: 2, character_id: 11, zone_id: 2, floor: 1, best_floor: 0, cleared: false }],
    });
    const open = await makeService({ db: openDb }).svc.enter(7, 'z2');
    assert.equal(open.success, true);
    assert.equal((open.data as { floor: number }).floor, 1);
    assert.equal((open.data as { bestFloor: number }).bestFloor, 0);
  });
});

// ===== 挑战 =====

describe('ZoneService.challenge 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.challenge(7, 'z1')), 'CHARACTER_NOT_FOUND');
  });

  test('指定 zoneCode 不存在 -> ZONE_NOT_FOUND', async () => {
    const z = zoneRow();
    const { svc } = makeService({ db: zoneDb({ zones: [z] }) });
    assert.equal(failingCode(await svc.challenge(7, 'nope')), 'ZONE_NOT_FOUND');
  });

  test('无 zoneCode 且无可用秘境 -> ZONE_NOT_FOUND', async () => {
    const db = zoneDb({ zones: [], state: [] });
    const { svc } = makeService({ db });
    const res = await svc.challenge(7);
    assert.equal(failingCode(res), 'ZONE_NOT_FOUND');
    assert.match(res.message, /暂无可用秘境/);
  });

  test('realm 不足 / 链式未解锁 -> REALM_TOO_LOW / ZONE_LOCKED', async () => {
    const lockedZone = zoneRow({ min_realm: 9 });
    const low = await makeService({ db: zoneDb({ zones: [lockedZone] }), character: makeChar({ realm: 3 }) }).svc.challenge(7, 'z1');
    assert.equal(failingCode(low), 'REALM_TOO_LOW');

    const z1 = zoneRow({ id: 1, code: 'z1', order_index: 1, min_realm: 1 });
    const z2 = zoneRow({ id: 2, code: 'z2', order_index: 2, min_realm: 1, require_prev_best_floor: 2 });
    const chainDb = zoneDb({
      zones: [z1, z2],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
    });
    const chain = await makeService({ db: chainDb }).svc.challenge(7, 'z2');
    assert.equal(failingCode(chain), 'ZONE_LOCKED');
  });

  test('cleared=true / floor>max_floor -> ALREADY_CLEARED', async () => {
    const z = zoneRow();
    const cleared = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 3, cleared: true }],
    });
    assert.equal(failingCode(await makeService({ db: cleared }).svc.challenge(7, 'z1')), 'ALREADY_CLEARED');

    const over = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 4, best_floor: 4, cleared: false }],
    });
    assert.equal(failingCode(await makeService({ db: over }).svc.challenge(7, 'z1')), 'ALREADY_CLEARED');
  });

  test('战力恰好差 1 -> CHALLENGE_FAILED；恰好等于门槛 -> 成功', async () => {
    const z = zoneRow();
    // realm4 -> 80；equip3 -> +15；skill8 -> floor(8/2)=4 => 99（差 1）
    const shortDb = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
      equip: '3',
      skill: '8',
    });
    const short = await makeService({ db: shortDb, character: makeChar({ realm: 4 }) }).svc.challenge(7, 'z1');
    assert.equal(failingCode(short), 'CHALLENGE_FAILED');
    assert.equal((short.data as { playerPower: number }).playerPower, 99);
    assert.equal((short.data as { floorRequirement: number }).floorRequirement, 100);

    const exactDb = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
      equip: '4',
      skill: '0',
    });
    const exact = await makeService({ db: exactDb, character: makeChar({ realm: 4 }) }).svc.challenge(7, 'z1');
    assert.equal(exact.success, true);
    assert.equal((exact.data as { playerPower: number }).playerPower, 100);
  });

  test('挑战成功 -> 写下一层 / bestFloor，settleKills 参数正确', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
      equip: '4',
      skill: '0',
    });
    const { svc, unitStub } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7, 'z1');
    assert.equal(res.success, true);
    const data = res.data as { floor: number; nextFloor: number; bestFloor: number; cleared: boolean; rewards: { lingyunBonus: number } };
    assert.equal(data.floor, 1);
    assert.equal(data.nextFloor, 2);
    assert.equal(data.bestFloor, 1);
    assert.equal(data.cleared, false);
    assert.equal(data.rewards.lingyunBonus, 10);
    assert.equal(unitStub.settleKills.callCount, 1);
    assert.deepEqual(unitStub.settleKills.last, [11, 'u1', 1, { lingyunBonusFlat: 10, tierOffsetBonus: 0, dropDrawBonus: 0 }]);
    assert.deepEqual(db.lastCall(/INSERT INTO game_zone_progress/)?.params, [11, 1, 2, 1, false]);
  });

  test('Boss 层 + 通关边界 -> 取 bossCode / 额外掉落 / cleared=true', async () => {
    const z = zoneRow();
    // floor3 门槛 = 100 + 2*50 = 200；realm4=80，equip24 -> +120 => 200
    const db = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 3, best_floor: 2, cleared: false }],
      equip: '24',
      skill: '0',
    });
    const { svc, unitStub } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7, 'z1');
    assert.equal(res.success, true);
    const data = res.data as { isBossFloor: boolean; nextFloor: number; bestFloor: number; cleared: boolean; extraDropDraws: number };
    assert.equal(data.isBossFloor, true);
    assert.equal(data.nextFloor, 4);
    assert.equal(data.bestFloor, 3);
    assert.equal(data.cleared, true);
    assert.equal(data.extraDropDraws, 1 + APP_CONFIG.zoneBossExtraDraws);
    assert.deepEqual(unitStub.settleKills.last, [
      11,
      'boss1',
      1,
      { lingyunBonusFlat: 30, tierOffsetBonus: 1, dropDrawBonus: 1 + APP_CONFIG.zoneBossExtraDraws },
    ]);
    assert.deepEqual(db.lastCall(/INSERT INTO game_zone_progress/)?.params, [11, 1, 4, 3, true]);
  });

  test('bestFloor 保留较大值（回退层数不降低记录）', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 5, cleared: false }],
      equip: '4',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const data = (await svc.challenge(7, 'z1')).data as { bestFloor: number };
    assert.equal(data.bestFloor, 5);
  });

  test('settleKills 失败 -> 原样返回失败结果', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
      equip: '4',
      skill: '0',
    });
    const { svc } = makeService({
      db,
      character: makeChar({ realm: 4 }),
      settle: { ok: false, result: fail('UNIT_NOT_FOUND', '单位不存在') },
    });
    const res = await svc.challenge(7, 'z1');
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'UNIT_NOT_FOUND');
  });

  test('未传 zoneCode -> 用 state 中当前秘境', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      progress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
      equip: '4',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7);
    assert.equal(res.success, true);
  });
});

// ===== 离线遭遇 =====

describe('ZoneService.encounterForCharacter 边界', () => {
  test('无可用秘境 -> null', async () => {
    const db = zoneDb({ zones: [], state: [] });
    const { svc } = makeService({ db });
    assert.equal(await svc.encounterForCharacter(11, 3), null);
  });

  test('当前秘境被删除 -> null', async () => {
    const db = zoneDb({ state: [{ id: 1, character_id: 11, current_zone_id: 1 }], byId: [] });
    const { svc } = makeService({ db });
    assert.equal(await svc.encounterForCharacter(11, 3), null);
  });

  test('普通层 -> unit_code；Boss 层 -> boss_code', async () => {
    const z = zoneRow();
    const normal = zoneDb({
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      byId: [z],
      oneProgress: [{ id: 1, character_id: 11, zone_id: 1, floor: 1, best_floor: 0, cleared: false }],
    });
    assert.deepEqual(await makeService({ db: normal }).svc.encounterForCharacter(11, 3), {
      zoneCode: 'z1',
      zoneName: '秘境一',
      floor: 1,
      isBoss: false,
      unitCode: 'u1',
    });

    const boss = zoneDb({
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      byId: [z],
      oneProgress: [{ id: 1, character_id: 11, zone_id: 1, floor: 3, best_floor: 2, cleared: false }],
    });
    const enc = await makeService({ db: boss }).svc.encounterForCharacter(11, 3);
    assert.equal(enc?.isBoss, true);
    assert.equal(enc?.unitCode, 'boss1');
  });
});
