/**
 * §22 秘境解锁体系 —— ZoneService 单元测试（按新契约重做）。
 *
 * 相对旧模型（min_realm 链式解锁 / REALM_TOO_LOW / ZONE_LOCKED / map 挂钩）的语义反转：
 * - 解锁 = 在线打满 max_floor 层 → `clears ≥ 1`（`isUnlocked` 权威判定，不看 cleared 列）；
 * - 突破（breakthrough）准入只看 tier_kind：training 免费放行、special 需道具（ZONE_ITEM_REQUIRED）；
 * - enter 只能进**已突破**秘境（重复挑战）；challenge 降级为开发者工具（无任何解锁闸门）；
 * - 挂机（idleTarget / idlePlan）= 已突破 ∧ idle_allowed===true；idlePlan 回 **1..maxFloor 整轮**（§23 A3）；
 * - 在线战斗 = `game_zone_state` 有行（progress / leave / challenge 无 code 时都依赖它）。
 *
 * 风格：makeChar / zoneRow / zoneDb / makeService 沿用既有脚手架；边界测试纪律见
 * 仓库根 AGENTS.local.md §4（无角色、无/缺行、NULL、极值、错误路径都须有断言）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ZoneService } from '../../../src/modules/logic/zone/internal/zone.service.js';
import { PlayerPowerService } from '../../../src/modules/character/player-power.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { fail } from '../../../src/modules/logic/zone/internal/zone.types.js';
import type { SettleResult } from '../../../src/modules/logic/combat/combat.api.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';
import type { Character } from '../../../src/modules/character/character.service.js';

type Row = Record<string, unknown>;

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

/** §22 game_zones 种子行全字段（realm/tier_kind/unlock_item_code/idle_allowed 为新列）。 */
function zoneRow(overrides: Row = {}): Row {
  return {
    id: 1,
    code: 'z1',
    name: '秘境一',
    order_index: 1,
    unit_code: 'u1',
    boss_code: 'boss1',
    base_power: 100,
    power_step: 50,
    max_floor: 3,
    boss_every_floors: 3,
    tier_bonus_every_floors: 2,
    drop_bonus_every_floors: 2,
    lingyun_bonus_per_floor: 10,
    realm: 3,
    tier_kind: 'training',
    unlock_item_code: null,
    idle_allowed: true,
    // 语义作废的旧列（保留在行结构里，服务不得再读它们当闸门）
    chapter: null,
    min_realm: null,
    require_prev_best_floor: 0,
    ...overrides,
  };
}

/** game_zone_progress 行（新列 clears）。 */
function progressRow(overrides: Row = {}): Row {
  return {
    id: 1,
    character_id: 11,
    zone_id: 1,
    floor: 1,
    best_floor: 0,
    cleared: false,
    clears: 0,
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
  // 战力复用 character 域的 PlayerPowerService（同一份 SQL），桩数据库直接喂它
  const playerPower = new PlayerPowerService(opts.db as never);
  const svc = new ZoneService(
    opts.db as never,
    charStub as never,
    unitStub as never,
    playerPower as never,
  );
  return { svc, charStub, unitStub };
}

interface ZoneDbOptions {
  zones?: Row[];
  progress?: Row[];
  state?: Row[];
  idle?: Row[];
  equip?: string | null;
  skill?: string | null;
  byCode?: Row[];
  byId?: Row[];
  oneProgress?: Row[];
  /** advanceFloor 的 `RETURNING *` 行（缺省空 → 走服务端回退 clears 口径） */
  advance?: Row[];
}

function zoneDb(opts: ZoneDbOptions = {}): FakeDatabase {
  return new FakeDatabase()
    .on(/FROM game_zones ORDER BY order_index, id/, { rows: opts.zones ?? [] })
    .on(/FROM game_zones WHERE code = \$1/, { rows: opts.byCode ?? [] })
    .on(/FROM game_zones WHERE id = \$1/, { rows: opts.byId ?? [] })
    .on(/SELECT \* FROM game_idle_state WHERE character_id = \$1/, { rows: opts.idle ?? [] })
    .on(/SELECT \* FROM game_zone_state WHERE character_id = \$1/, { rows: opts.state ?? [] })
    .on(/FROM game_zone_progress WHERE character_id = \$1 AND zone_id = \$2/, { rows: opts.oneProgress ?? [] })
    .on(/FROM game_zone_progress WHERE character_id = \$1$/, { rows: opts.progress ?? [] })
    // advanceFloor 带 RETURNING 的 upsert（startRun 的同名 INSERT 无 RETURNING，不会误中）
    .on(/INSERT INTO game_zone_progress[\s\S]*RETURNING \*/, () => ({ rows: opts.advance ?? [] }))
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

describe('ZoneService.catalog 边界（§22 只下发已突破秘境）', () => {
  type CatalogData = {
    total: number;
    playerPower: number;
    currentZone: string | null;
    idleTarget: string | null;
    zones: Array<{
      code: string;
      name: string;
      realm: number;
      tierKind: string;
      orderIndex: number;
      idleAllowed: boolean;
      unlockItemCode: string | null;
      unitCode: string;
      bossCode: string | null;
      basePower: number;
      powerStep: number;
      maxFloor: number;
      lingyunBonusPerFloor: number;
      current: boolean;
      progress: { floor: number; bestFloor: number; cleared: boolean; clears: number };
    }>;
    breakthrough: Array<{
      code: string;
      name: string;
      realm: number;
      tierKind: string;
      canBreakthrough: boolean;
      lockReason: string;
      unlockItemCode: string | null;
      cleared: boolean;
      clears: number;
      bestFloor: number;
      maxFloor: number;
      basePower: number;
      powerStep: number;
    }>;
  };

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.catalog(7)), 'CHARACTER_NOT_FOUND');
  });

  test('无秘境且无任何状态行 -> total=0 / currentZone=null / idleTarget=null / 空数组', async () => {
    const db = zoneDb({ zones: [], state: [], idle: [], progress: [] });
    const { svc } = makeService({ db });
    const data = (await svc.catalog(7)).data as CatalogData;
    assert.equal(data.total, 0);
    assert.equal(data.currentZone, null);
    assert.equal(data.idleTarget, null);
    assert.deepEqual(data.zones, []);
    assert.deepEqual(data.breakthrough, []);
  });

  test('zones 只含 clears≥1；breakthrough 全量；realm NULL→0；current/idleTarget 映射 code', async () => {
    const z1 = zoneRow({ id: 1, code: 'z1', order_index: 1, realm: 3 });
    const z2 = zoneRow({
      id: 2,
      code: 'z2',
      order_index: 2,
      realm: null,
      tier_kind: 'special',
      unlock_item_code: 'sp_item',
      idle_allowed: false,
    });
    const z3 = zoneRow({ id: 3, code: 'z3', order_index: 3, realm: 5 });
    const db = zoneDb({
      zones: [z1, z2, z3],
      state: [{ id: 1, character_id: 11, current_zone_id: 2 }],
      idle: [{ id: 1, character_id: 11, zone_id: 1 }],
      progress: [
        progressRow({ id: 1, zone_id: 1, floor: 2, best_floor: 2, cleared: false, clears: 2 }),
        progressRow({ id: 2, zone_id: 2, floor: 3, best_floor: 3, cleared: true, clears: '1' }),
      ],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 3 }) });
    const data = (await svc.catalog(7)).data as CatalogData;

    assert.equal(data.total, 2); // z3 无进度行 → clears=0 → 不下发
    assert.equal(data.playerPower, 3 * APP_CONFIG.zonePower.realmWeight);
    assert.equal(data.currentZone, 'z2');
    assert.equal(data.idleTarget, 'z1');
    assert.deepEqual(data.zones.map((z) => z.code), ['z1', 'z2']);

    const z1v = data.zones[0];
    assert.equal(z1v.realm, 3);
    assert.equal(z1v.tierKind, 'training');
    assert.equal(z1v.idleAllowed, true);
    assert.equal(z1v.unlockItemCode, null);
    assert.equal(z1v.current, false);
    assert.deepEqual(z1v.progress, { floor: 2, bestFloor: 2, cleared: false, clears: 2 });

    const z2v = data.zones[1];
    assert.equal(z2v.realm, 0, 'realm NULL → 0（不静默回落）');
    assert.equal(z2v.tierKind, 'special');
    assert.equal(z2v.idleAllowed, false);
    assert.equal(z2v.unlockItemCode, 'sp_item');
    assert.equal(z2v.current, true);
    assert.deepEqual(z2v.progress, { floor: 3, bestFloor: 3, cleared: true, clears: 1 });

    assert.deepEqual(data.breakthrough.map((b) => b.code), ['z1', 'z2', 'z3']);
    const b1 = data.breakthrough[0];
    assert.equal(b1.canBreakthrough, true);
    assert.equal(b1.lockReason, 'ok');
    assert.equal(b1.unlockItemCode, null);
    assert.equal(b1.cleared, true);
    assert.equal(b1.clears, 2);
    assert.equal(b1.bestFloor, 2);
    assert.equal(b1.maxFloor, 3);
    assert.equal(b1.basePower, 100);
    assert.equal(b1.powerStep, 50);

    const b2 = data.breakthrough[1];
    assert.equal(b2.realm, 0, 'breakthrough 同样 realm NULL→0');
    assert.equal(b2.tierKind, 'special');
    assert.equal(b2.canBreakthrough, false);
    assert.equal(b2.lockReason, 'item_required');
    assert.equal(b2.unlockItemCode, 'sp_item');
    assert.equal(b2.cleared, true, 'clears=\'1\' 字符串经 Number 后仍判已突破');
    assert.equal(b2.clears, 1);
    assert.equal(b2.bestFloor, 3);

    const b3 = data.breakthrough[2];
    assert.equal(b3.canBreakthrough, true);
    assert.equal(b3.cleared, false);
    assert.equal(b3.clears, 0);
    assert.equal(b3.bestFloor, 0);
  });

  test('state/idle 行指向已删秘境 -> currentZone=null / idleTarget=null（不清空 clears 图鉴）', async () => {
    const z1 = zoneRow({ id: 1, code: 'z1' });
    const db = zoneDb({
      zones: [z1],
      state: [{ id: 1, character_id: 11, current_zone_id: 999 }],
      idle: [{ id: 1, character_id: 11, zone_id: 999 }],
      progress: [progressRow({ zone_id: 1, clears: 1 })],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db });
    const data = (await svc.catalog(7)).data as CatalogData;
    assert.equal(data.total, 1);
    assert.equal(data.currentZone, null);
    assert.equal(data.idleTarget, null);
  });
});

// ===== 进度 =====

describe('ZoneService.progress 边界（以 game_zone_state 行为准）', () => {
  type ProgressData = {
    currentZone: { code: string; name: string; realm: number };
    floor: number;
    bestFloor: number;
    clears: number;
    cleared: boolean;
    playerPower: number;
    floorRequirement: number;
    isBossFloor: boolean;
    lingyunBonus: number;
    dropTierOffset: number;
    extraDropDraws: number;
  };

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.progress(7)), 'CHARACTER_NOT_FOUND');
  });

  test('无 game_zone_state 行 -> NO_ONLINE_BATTLE（当前不在秘境中）', async () => {
    const db = zoneDb({ zones: [], state: [] });
    const { svc } = makeService({ db });
    const res = await svc.progress(7);
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'NO_ONLINE_BATTLE');
    assert.match(res.message, /当前不在秘境中/);
  });

  test('state 行指向已删秘境 -> 清战斗行后同样 NO_ONLINE_BATTLE', async () => {
    const db = zoneDb({ zones: [], state: [{ id: 1, character_id: 11, current_zone_id: 999 }] });
    const { svc } = makeService({ db });
    const res = await svc.progress(7);
    assert.equal(failingCode(res), 'NO_ONLINE_BATTLE');
    assert.match(res.message, /当前不在秘境中/);
    assert.deepEqual(db.lastCall(/DELETE FROM game_zone_state WHERE character_id = \$1/)?.params, [11]);
  });

  test('缺进度行 -> 默认 floor=1/bestFloor=0/cleared=false/clears=0；无作废字段', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byId: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      progress: [],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db });
    const res = await svc.progress(7);
    assert.equal(res.success, true);
    const raw = res.data as ProgressData & Record<string, unknown>;
    assert.equal(raw.floor, 1);
    assert.equal(raw.bestFloor, 0);
    assert.equal(raw.cleared, false);
    assert.equal(raw.clears, 0);
    assert.deepEqual(raw.currentZone, { code: 'z1', name: '秘境一', realm: 3 });
    assert.equal(raw.floorRequirement, 100);
    assert.equal('unlocked' in raw, false, '旧 unlocked 字段已作废');
    assert.equal('canChallenge' in raw, false, '旧 canChallenge 字段已作废');
    assert.equal('encounterUnit' in raw, false, '旧 encounterUnit 字段已作废');
    assert.equal('chapter' in raw, false, '旧 chapter 字段已作废');
  });

  test('realm=NULL 的秘境 -> currentZone.realm=0（显式未知，不静默参与数值）', async () => {
    const z = zoneRow({ realm: null });
    const db = zoneDb({
      byId: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      progress: [],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db });
    const data = (await svc.progress(7)).data as ProgressData;
    assert.equal(data.currentZone.realm, 0);
  });

  test('floor=2 -> 门槛 base+1×step、灵韵 ×2、非 Boss、无深度加成', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byId: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      oneProgress: [progressRow({ floor: 2, best_floor: 1, cleared: false, clears: 1 })],
      equip: '14',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const data = (await svc.progress(7)).data as ProgressData;
    assert.equal(data.floor, 2);
    assert.equal(data.bestFloor, 1);
    assert.equal(data.clears, 1);
    assert.equal(data.cleared, false);
    assert.equal(data.floorRequirement, 150);
    assert.equal(data.playerPower, 150);
    assert.equal(data.lingyunBonus, 20);
    assert.equal(data.isBossFloor, false);
    assert.equal(data.dropTierOffset, 0);
    assert.equal(data.extraDropDraws, 0);
  });

  test('floor=3（Boss 层）-> 深度加成与 Boss 额外抽', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byId: [z],
      state: [{ id: 1, character_id: 11, current_zone_id: 1 }],
      oneProgress: [progressRow({ floor: 3, best_floor: 2, cleared: false, clears: 1 })],
      equip: '0',
      skill: '0',
    });
    const { svc } = makeService({ db });
    const data = (await svc.progress(7)).data as ProgressData;
    assert.equal(data.floorRequirement, 200);
    assert.equal(data.isBossFloor, true);
    assert.equal(data.dropTierOffset, 1);
    assert.equal(data.extraDropDraws, 1 + APP_CONFIG.zoneBossExtraDraws);
    assert.equal(data.lingyunBonus, 30);
  });
});

// ===== 进入 =====

describe('ZoneService.enter 边界（仅已突破秘境可重复挑战）', () => {
  type EnterData = {
    currentZone: { code: string; name: string; realm: number };
    floor: number;
    bestFloor: number;
    clears: number;
  };

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

  test('缺进度行 -> clears=0 缺省 -> ZONE_NOT_UNLOCKED', async () => {
    const z = zoneRow();
    const db = zoneDb({ byCode: [z], oneProgress: [] });
    const res = await makeService({ db }).svc.enter(7, 'z1');
    assert.equal(failingCode(res), 'ZONE_NOT_UNLOCKED');
    assert.ok(res.message.includes('需在线打满 3 层解锁'));
  });

  test('cleared=true 但 clears=0（旧数据残留）-> 仍 ZONE_NOT_UNLOCKED（权威判定只看 clears）', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byCode: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 3, cleared: true, clears: 0 })],
    });
    const res = await makeService({ db }).svc.enter(7, 'z1');
    assert.equal(failingCode(res), 'ZONE_NOT_UNLOCKED');
  });

  test('clears=1 且 floor=1 -> 成功且不重置（无 progress 写、写 state）', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byCode: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 3, cleared: true, clears: 1 })],
    });
    const { svc } = makeService({ db });
    const res = await svc.enter(7, 'z1');
    assert.equal(res.success, true);
    assert.match(res.message, /已进入秘境：秘境一/);
    const data = res.data as EnterData;
    assert.deepEqual(data.currentZone, { code: 'z1', name: '秘境一', realm: 3 });
    assert.equal(data.floor, 1);
    assert.equal(data.bestFloor, 3);
    assert.equal(data.clears, 1);
    assert.equal(db.callsMatching(/INSERT INTO game_zone_progress/).length, 0, 'floor 已在起点不重置');
    assert.deepEqual(db.lastCall(/INSERT INTO game_zone_state/)?.params, [11, 1]);
  });

  test('clears=1 且 floor=3（打满停在上限）-> startRun 重置 floor=1，bestFloor/clears 保留', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byCode: [z],
      oneProgress: [progressRow({ floor: 3, best_floor: 3, cleared: true, clears: 1 })],
    });
    const { svc } = makeService({ db });
    const res = await svc.enter(7, 'z1');
    assert.equal(res.success, true);
    const data = res.data as EnterData;
    assert.equal(data.floor, 1);
    assert.equal(data.bestFloor, 3);
    assert.equal(data.clears, 1);
    const insert = db.callsMatching(/INSERT INTO game_zone_progress/).find((c) => !/RETURNING/.test(c.sql));
    assert.deepEqual(insert?.params, [11, 1, 3, 1], 'VALUES($1,$2,1,$3,TRUE,$4) → bestFloor/clears 写回');
  });
});

// ===== 突破 =====

describe('ZoneService.breakthrough 边界（training 免费 / special 需道具）', () => {
  type BattleEntry = {
    currentZone: { code: string; name: string; realm: number };
    floor: number;
    bestFloor: number;
    clears: number;
  };

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.breakthrough(7, 'z1')), 'CHARACTER_NOT_FOUND');
  });

  test('秘境不存在 -> ZONE_NOT_FOUND', async () => {
    const db = zoneDb({ byCode: [] });
    const res = await makeService({ db }).svc.breakthrough(7, 'nope');
    assert.equal(failingCode(res), 'ZONE_NOT_FOUND');
  });

  test('special -> success:false + ZONE_ITEM_REQUIRED + zone/itemCode，且不写 state', async () => {
    const z = zoneRow({ tier_kind: 'special', unlock_item_code: 'sp_item', idle_allowed: false });
    const db = zoneDb({ byCode: [z] });
    const res = await makeService({ db }).svc.breakthrough(7, 'z1');
    assert.equal(res.success, false);
    assert.match(res.message, /突破需要特殊道具：秘境一/);
    const data = res.data as {
      code: string;
      zone: { code: string; name: string; realm: number };
      itemCode: string | null;
    };
    assert.equal(data.code, 'ZONE_ITEM_REQUIRED');
    assert.deepEqual(data.zone, { code: 'z1', name: '秘境一', realm: 3 });
    assert.equal(data.itemCode, 'sp_item');
    assert.equal(db.callsMatching(/INSERT INTO game_zone_state/).length, 0);
  });

  test('special 且 unlock_item_code=NULL -> itemCode=null（不产生 undefined）', async () => {
    const z = zoneRow({ tier_kind: 'special', unlock_item_code: null });
    const db = zoneDb({ byCode: [z] });
    const res = await makeService({ db }).svc.breakthrough(7, 'z1');
    assert.equal(res.success, false);
    assert.equal((res.data as { itemCode: string | null }).itemCode, null);
  });

  test('training 放行：境界极低/未突破/战力 0 都能进（旧 min_realm 闸门作废）', async () => {
    const z = zoneRow({ realm: 9, min_realm: 9 }); // 旧境界闸门字段必须被无视
    const db = zoneDb({ byCode: [z] });
    const { svc } = makeService({ db, character: makeChar({ realm: 1 }) });
    const res = await svc.breakthrough(7, 'z1');
    assert.equal(res.success, true);
    assert.match(res.message, /进入突破：秘境一/);
    const data = res.data as BattleEntry;
    assert.deepEqual(data.currentZone, { code: 'z1', name: '秘境一', realm: 9 });
    assert.equal(data.floor, 1);
    assert.equal(data.bestFloor, 0);
    assert.equal(data.clears, 0);
    assert.deepEqual(db.lastCall(/INSERT INTO game_zone_state/)?.params, [11, 1]);
  });

  test('training、已突破且 floor=3 -> 可重复突破，startRun 重置 floor=1 且 clears 不清零', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byCode: [z],
      oneProgress: [progressRow({ floor: 3, best_floor: 3, cleared: true, clears: 2 })],
    });
    const { svc } = makeService({ db });
    const res = await svc.breakthrough(7, 'z1');
    assert.equal(res.success, true);
    const data = res.data as BattleEntry;
    assert.equal(data.floor, 1);
    assert.equal(data.bestFloor, 3);
    assert.equal(data.clears, 2);
    const insert = db.callsMatching(/INSERT INTO game_zone_progress/).find((c) => !/RETURNING/.test(c.sql));
    assert.deepEqual(insert?.params, [11, 1, 3, 2]);
  });

  test('tier_kind 未知字符串（旧库缺省）-> 白名单按 training 放行；realm NULL -> currentZone.realm=0', async () => {
    const z = zoneRow({ tier_kind: 'unknown_legacy', realm: null });
    const db = zoneDb({ byCode: [z] });
    const res = await makeService({ db }).svc.breakthrough(7, 'z1');
    assert.equal(res.success, true);
    assert.equal((res.data as BattleEntry).currentZone.realm, 0);
  });
});

// ===== 离开 =====

describe('ZoneService.leave 边界（清 game_zone_state 行）', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.leave(7)), 'CHARACTER_NOT_FOUND');
  });

  test('无 state 行 -> data.left=false / currentZone=null，且不写 DELETE', async () => {
    const db = zoneDb({ state: [] });
    const res = await makeService({ db }).svc.leave(7);
    assert.equal(res.success, true);
    assert.match(res.message, /当前不在秘境中/);
    assert.deepEqual(res.data, { currentZone: null, left: false });
    assert.equal(db.callsMatching(/DELETE FROM game_zone_state/).length, 0);
  });

  test('有 state 行 -> DELETE 落库、data.left=true', async () => {
    const db = zoneDb({ state: [{ id: 1, character_id: 11, current_zone_id: 1 }] });
    const res = await makeService({ db }).svc.leave(7);
    assert.equal(res.success, true);
    assert.match(res.message, /已离开秘境/);
    assert.deepEqual(res.data, { currentZone: null, left: true });
    assert.deepEqual(db.lastCall(/DELETE FROM game_zone_state/)?.params, [11]);
  });

  test('幂等：连续两次 leave，第二次 left=false（DELETE 使行真的消失）', async () => {
    const db = new FakeDatabase();
    let stateExists = true;
    db.on(/SELECT \* FROM game_zone_state WHERE character_id = \$1/, () => ({
      rows: stateExists ? [{ id: 1, character_id: 11, current_zone_id: 1 }] : [],
    }));
    db.on(/DELETE FROM game_zone_state WHERE character_id = \$1/, () => {
      stateExists = false;
      return { rows: [] };
    });
    const { svc } = makeService({ db });
    const first = (await svc.leave(7)).data as { left: boolean };
    const second = (await svc.leave(7)).data as { left: boolean };
    assert.equal(first.left, true);
    assert.equal(second.left, false);
  });
});

// ===== 挂机点 =====

describe('ZoneService.idleTarget 边界（已突破 ∧ idle_allowed）', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.idleTarget(7, 'z1')), 'CHARACTER_NOT_FOUND');
  });

  test('秘境不存在 -> ZONE_NOT_FOUND', async () => {
    const db = zoneDb({ byCode: [] });
    const res = await makeService({ db }).svc.idleTarget(7, 'nope');
    assert.equal(failingCode(res), 'ZONE_NOT_FOUND');
  });

  test('未突破（缺行 / clears=0）-> ZONE_NOT_IDLE_ELIGIBLE，提示「尚未突破该秘境」', async () => {
    for (const oneProgress of [[], [progressRow({ floor: 1, best_floor: 0, cleared: false, clears: 0 })]]) {
      const z = zoneRow();
      const db = zoneDb({ byCode: [z], oneProgress });
      const res = await makeService({ db }).svc.idleTarget(7, 'z1');
      assert.equal(failingCode(res), 'ZONE_NOT_IDLE_ELIGIBLE');
      assert.match(res.message, /^尚未突破该秘境/);
    }
  });

  test('special 已突破 -> ZONE_NOT_IDLE_ELIGIBLE（不可挂机）', async () => {
    const z = zoneRow({ tier_kind: 'special', unlock_item_code: 'sp_item', idle_allowed: false });
    const db = zoneDb({
      byCode: [z],
      oneProgress: [progressRow({ floor: 3, best_floor: 3, cleared: true, clears: 1 })],
    });
    const res = await makeService({ db }).svc.idleTarget(7, 'z1');
    assert.equal(failingCode(res), 'ZONE_NOT_IDLE_ELIGIBLE');
    assert.match(res.message, /该秘境不可挂机（特殊秘境）/);
  });

  test('training 但 idle_allowed=false -> 同样不可挂机（判据是 idle_allowed 而非 tier_kind）', async () => {
    const z = zoneRow({ idle_allowed: false });
    const db = zoneDb({
      byCode: [z],
      oneProgress: [progressRow({ clears: 1 })],
    });
    const res = await makeService({ db }).svc.idleTarget(7, 'z1');
    assert.equal(failingCode(res), 'ZONE_NOT_IDLE_ELIGIBLE');
    assert.match(res.message, /该秘境不可挂机（特殊秘境）/);
  });

  test('已突破且 idle_allowed=true -> upsert game_idle_state，data.idleTarget 带 realm', async () => {
    const z = zoneRow();
    const db = zoneDb({
      byCode: [z],
      oneProgress: [progressRow({ floor: 3, best_floor: 3, cleared: true, clears: 1 })],
    });
    const res = await makeService({ db }).svc.idleTarget(7, 'z1');
    assert.equal(res.success, true);
    assert.match(res.message, /已设置挂机点：秘境一/);
    assert.deepEqual(db.lastCall(/INSERT INTO game_idle_state/)?.params, [11, 1]);
    assert.deepEqual((res.data as { idleTarget: { code: string; name: string; realm: number } }).idleTarget, {
      code: 'z1',
      name: '秘境一',
      realm: 3,
    });
  });
});

// ===== 在线战斗判定与挂机遭遇 =====

describe('ZoneService.inOnlineBattle 边界', () => {
  test('game_zone_state 有行 -> true；无行 -> false', async () => {
    const online = zoneDb({ state: [{ id: 1, character_id: 11, current_zone_id: 1 }] });
    assert.equal(await makeService({ db: online }).svc.inOnlineBattle(11), true);

    const offline = zoneDb({ state: [] });
    assert.equal(await makeService({ db: offline }).svc.inOnlineBattle(11), false);
  });
});

describe('ZoneService.idlePlan 边界（§23 A3 整轮逐层计划）', () => {
  const idleState = [{ id: 1, character_id: 11, zone_id: 1 }];
  /** 挂机点可用的库：已突破（clears=1）+ 指定 zone / progress 覆盖。 */
  const eligibleDb = (zone: Row = zoneRow(), progress: Row = {}) =>
    zoneDb({ idle: idleState, byId: [zone], oneProgress: [progressRow({ clears: 1, ...progress })] });

  test('无 game_idle_state 行 -> null（没设挂机点）', async () => {
    const db = zoneDb({ idle: [] });
    assert.equal(await makeService({ db }).svc.idlePlan(11), null);
  });

  test('挂机点指向已删秘境 -> null', async () => {
    const db = zoneDb({ idle: idleState, byId: [] });
    assert.equal(await makeService({ db }).svc.idlePlan(11), null);
  });

  test('未突破（clears=0）-> 不满足 idleEligible -> null', async () => {
    const db = zoneDb({ idle: idleState, byId: [zoneRow()], oneProgress: [progressRow({ clears: 0 })] });
    assert.equal(await makeService({ db }).svc.idlePlan(11), null);
  });

  test('已突破但 idle_allowed=false -> null（安全侧：绝不允许意外可挂机）', async () => {
    const db = eligibleDb(zoneRow({ idle_allowed: false }));
    assert.equal(await makeService({ db }).svc.idlePlan(11), null);
  });

  test('A3 核心：已打满（floor 停在 max_floor=Boss 层）仍返回 1..3 全部层，不再只回 Boss 层', async () => {
    // 旧 idleEncounter 在这里只回 floor=3/boss1 ⇒ 挂机永远在打 Boss。A3 必须给出整轮。
    const db = eligibleDb(zoneRow(), { floor: 3, best_floor: 3, cleared: true, clears: 2 });
    assert.deepEqual(await makeService({ db }).svc.idlePlan(11), {
      zoneCode: 'z1',
      zoneName: '秘境一',
      realm: 3,
      maxFloor: 3,
      floors: [
        {
          floor: 1,
          unitCode: 'u1',
          isBoss: false,
          floorRequirement: 100,
          lingyunBonusFlat: 10,
          tierOffsetBonus: 0,
          dropDrawBonus: 0,
        },
        {
          floor: 2,
          unitCode: 'u1',
          isBoss: false,
          floorRequirement: 150,
          lingyunBonusFlat: 20,
          tierOffsetBonus: 0,
          dropDrawBonus: 0,
        },
        {
          floor: 3,
          unitCode: 'boss1',
          isBoss: true,
          floorRequirement: 200,
          lingyunBonusFlat: 30,
          tierOffsetBonus: 1,
          dropDrawBonus: 1 + APP_CONFIG.zoneBossExtraDraws,
        },
      ],
    });
  });

  test('与 progress.floor 无关：半程（floor=1）与越界（floor=99）都给出同一份 1..3', async () => {
    const half = await makeService({ db: eligibleDb(zoneRow(), { floor: 1, best_floor: 0 }) }).svc.idlePlan(11);
    const over = await makeService({
      db: eligibleDb(zoneRow(), { floor: 99, best_floor: 99, cleared: true }),
    }).svc.idlePlan(11);
    assert.deepEqual(half?.floors.map((f) => f.floor), [1, 2, 3]);
    assert.deepEqual(half, over);
  });

  test('max_floor=1 -> 单层计划（退化为单层，且它不是 Boss 层）', async () => {
    const plan = await makeService({ db: eligibleDb(zoneRow({ max_floor: 1 })) }).svc.idlePlan(11);
    assert.equal(plan?.maxFloor, 1);
    assert.deepEqual(plan?.floors.map((f) => [f.floor, f.isBoss, f.unitCode]), [[1, false, 'u1']]);
  });

  test('max_floor 非法（0 / null / NaN / 负数）-> 收敛为 1 层，绝不产生空计划', async () => {
    for (const bad of [0, null, Number.NaN, -3]) {
      const plan = await makeService({ db: eligibleDb(zoneRow({ max_floor: bad })) }).svc.idlePlan(11);
      assert.equal(plan?.maxFloor, 1, 'max_floor=' + String(bad));
      assert.equal(plan?.floors.length, 1, 'max_floor=' + String(bad));
    }
  });

  test('无 boss_code -> 全层走 unit_code 且 isBoss 恒 false（Boss 额外判定不生效）', async () => {
    const plan = await makeService({ db: eligibleDb(zoneRow({ boss_code: null })) }).svc.idlePlan(11);
    assert.deepEqual(plan?.floors.map((f) => [f.isBoss, f.unitCode, f.dropDrawBonus]), [
      [false, 'u1', 0],
      [false, 'u1', 0],
      [false, 'u1', 1],
    ]);
  });

  test('realm 非法（NULL）-> realm=0（不静默回落成合法档位）', async () => {
    const plan = await makeService({ db: eligibleDb(zoneRow({ realm: null })) }).svc.idlePlan(11);
    assert.equal(plan?.realm, 0);
  });
});

// ===== 挑战（开发者工具，无解锁闸门）=====

describe('ZoneService.challenge 边界（开发者工具，无任何解锁闸门）', () => {
  type ChallengeData = {
    zone: { code: string; name: string };
    floor: number;
    nextFloor: number;
    bestFloor: number;
    clears: number;
    cleared: boolean;
    playerPower: number;
    floorRequirement: number;
    isBossFloor: boolean;
    dropTierOffset: number;
    extraDropDraws: number;
    rewards: { lingyunGained: number; lingyunBonus: number; lingyunTotal: number };
  };

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: zoneDb(), character: null });
    assert.equal(failingCode(await svc.challenge(7, 'z1')), 'CHARACTER_NOT_FOUND');
  });

  test('指定 zoneCode 不存在 -> ZONE_NOT_FOUND', async () => {
    const z = zoneRow();
    const { svc } = makeService({ db: zoneDb({ zones: [z] }) });
    assert.equal(failingCode(await svc.challenge(7, 'nope')), 'ZONE_NOT_FOUND');
  });

  test('无 zoneCode 且无 state 行 -> NO_ONLINE_BATTLE（当前不在秘境中）', async () => {
    const db = zoneDb({ zones: [], state: [] });
    const { svc } = makeService({ db });
    const res = await svc.challenge(7);
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'NO_ONLINE_BATTLE');
    assert.match(res.message, /当前不在秘境中/);
  });

  test('无 zoneCode、state 行指向已删秘境 -> NO_ONLINE_BATTLE', async () => {
    const db = zoneDb({ zones: [], state: [{ id: 1, character_id: 11, current_zone_id: 999 }] });
    const { svc } = makeService({ db });
    assert.equal(failingCode(await svc.challenge(7)), 'NO_ONLINE_BATTLE');
  });

  test('无解锁闸门：clears=0 且角色境界远低于 min_realm 也放行（旧 REALM_TOO_LOW 作废）', async () => {
    const z = zoneRow({ realm: 9, min_realm: 9 });
    const db = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ clears: 0 })],
      equip: '4',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7, 'z1');
    assert.equal(res.success, true);
    assert.match(res.message, /挑战成功：秘境一 第1层/);
  });

  test('cleared=true / floor 已超上限 -> 无 ALREADY_CLEARED 闸门，可重复挑战', async () => {
    const z = zoneRow();
    const cleared = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 3, cleared: true, clears: 1 })],
      equip: '4',
      skill: '0',
    });
    assert.equal((await makeService({ db: cleared, character: makeChar({ realm: 4 }) }).svc.challenge(7, 'z1')).success, true);

    const over = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 4, best_floor: 4, cleared: false, clears: 1 })],
      equip: '34',
      skill: '0',
    });
    const res = await makeService({ db: over, character: makeChar({ realm: 4 }) }).svc.challenge(7, 'z1');
    assert.equal(res.success, true);
    const data = res.data as ChallengeData;
    assert.equal(data.floor, 4);
    assert.equal(data.nextFloor, 3, '通关后 nextFloor 停在上限');
    assert.equal(data.cleared, true);
    assert.equal(data.bestFloor, 4);
    assert.equal(data.clears, 1, '无 RETURNING 行时按 floor≥maxFloor 回退 1');
  });

  test('战力恰好差 1 -> CHALLENGE_FAILED；恰好等于门槛 -> 成功', async () => {
    const z = zoneRow();
    // realm4 -> 80；equip3 -> +15；skill8 -> floor(8/2)=4 => 99（差 1）
    const shortDb = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 0, cleared: false, clears: 0 })],
      equip: '3',
      skill: '8',
    });
    const short = await makeService({ db: shortDb, character: makeChar({ realm: 4 }) }).svc.challenge(7, 'z1');
    assert.equal(failingCode(short), 'CHALLENGE_FAILED');
    assert.equal((short.data as { playerPower: number }).playerPower, 99);
    assert.equal((short.data as { floorRequirement: number }).floorRequirement, 100);

    const exactDb = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 0, cleared: false, clears: 0 })],
      equip: '4',
      skill: '0',
    });
    const exact = await makeService({ db: exactDb, character: makeChar({ realm: 4 }) }).svc.challenge(7, 'z1');
    assert.equal(exact.success, true);
    assert.equal((exact.data as { playerPower: number }).playerPower, 100);
  });

  test('成功（普通层）-> settleKills 参数正确、advanceFloor 写 RETURNING 6 参、响应含 clears/cleared', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 0, cleared: false, clears: 0 })],
      equip: '4',
      skill: '0',
    });
    const { svc, unitStub } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7, 'z1');
    assert.equal(res.success, true);
    const data = res.data as ChallengeData;
    assert.equal(data.floor, 1);
    assert.equal(data.nextFloor, 2);
    assert.equal(data.bestFloor, 1);
    assert.equal(data.cleared, false);
    assert.equal(data.clears, 0);
    assert.equal(data.rewards.lingyunBonus, 10);
    assert.equal(data.rewards.lingyunGained, 5);
    assert.equal(unitStub.settleKills.callCount, 1);
    assert.deepEqual(unitStub.settleKills.last, [11, 'u1', 1, { lingyunBonusFlat: 10, tierOffsetBonus: 0, dropDrawBonus: 0 }]);
    assert.deepEqual(db.lastCall(/INSERT INTO game_zone_progress[\s\S]*RETURNING \*/)?.params, [11, 1, 2, 1, false, 0]);
  });

  test('Boss 层通关 -> boss_code / 额外掉落 / floor 停 maxFloor / clears 自增 1', async () => {
    const z = zoneRow();
    // floor3 门槛 = 100 + 2*50 = 200；realm4=80，equip24 -> +120 => 200
    const db = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 3, best_floor: 2, cleared: false, clears: 0 })],
      equip: '24',
      skill: '0',
    });
    const { svc, unitStub } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7, 'z1');
    assert.equal(res.success, true);
    const data = res.data as ChallengeData;
    assert.equal(data.isBossFloor, true);
    assert.equal(data.floor, 3);
    assert.equal(data.nextFloor, 3, '通关后 nextFloor 停在上限');
    assert.equal(data.bestFloor, 3);
    assert.equal(data.cleared, true);
    assert.equal(data.clears, 1);
    assert.equal(data.extraDropDraws, 1 + APP_CONFIG.zoneBossExtraDraws);
    assert.deepEqual(unitStub.settleKills.last, [
      11,
      'boss1',
      1,
      { lingyunBonusFlat: 30, tierOffsetBonus: 1, dropDrawBonus: 1 + APP_CONFIG.zoneBossExtraDraws },
    ]);
    // storedFloor=3（不写 4）、nextBest=3、cleared=true、EXCLUDED.clears=1
    assert.deepEqual(db.lastCall(/INSERT INTO game_zone_progress[\s\S]*RETURNING \*/)?.params, [11, 1, 3, 3, true, 1]);
  });

  test('advanceFloor 读 RETURNING 行的累计 clears（不本地兜底）', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 0, cleared: false, clears: 5 })],
      advance: [progressRow({ floor: 2, best_floor: 1, cleared: false, clears: '7' })],
      equip: '4',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7, 'z1');
    assert.equal(res.success, true);
    assert.equal((res.data as ChallengeData).clears, 7, 'SQL 算出的 clears = 5 + 0（EXCLUDED=0），服务读 RETURNING 值');
  });

  test('bestFloor 保留较大值（回退层数不降低记录）', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 5, cleared: false, clears: 0 })],
      equip: '4',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const data = (await svc.challenge(7, 'z1')).data as ChallengeData;
    assert.equal(data.bestFloor, 5);
  });

  test('settleKills 失败 -> 原样返回失败结果', async () => {
    const z = zoneRow();
    const db = zoneDb({
      zones: [z],
      oneProgress: [progressRow({ floor: 1, best_floor: 0, cleared: false, clears: 0 })],
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
      oneProgress: [progressRow({ floor: 1, best_floor: 0, cleared: false, clears: 0 })],
      equip: '4',
      skill: '0',
    });
    const { svc } = makeService({ db, character: makeChar({ realm: 4 }) });
    const res = await svc.challenge(7);
    assert.equal(res.success, true);
  });
});