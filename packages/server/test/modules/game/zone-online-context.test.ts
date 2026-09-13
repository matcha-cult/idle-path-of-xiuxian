/**
 * ZoneService 在线历练口径（P3.0 T4/T7）。
 *
 * 为什么单独一个文件：`zone.service.test.ts` 覆盖的是挑战 / 解锁 / 图鉴，
 * 这里只钉**在线 tick 复用的两个入口**：
 * - `onlineContext`：门槛 / Boss 层 / 掉落深度 / 层灵韵加成**必须走既有派生函数**，
 *   否则在线与挑战会出现两套数值口径（这是本轮最容易埋雷的地方）；
 * - `advanceFloor`：与 `challenge` 同表同 `GREATEST` 口径，**唯一差异是通关时 floor 不越过
 *   `max_floor`**（面板要显示 3/3）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ZoneService } from '../../../src/modules/logic/zone/internal/zone.service.js';
import { PlayerPowerService } from '../../../src/modules/character/player-power.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';
import type { Character } from '../../../src/modules/character/character.service.js';

type Row = Record<string, unknown>;

function makeChar(realm = 5): Character {
  return {
    id: 11,
    userId: 7,
    nickname: '道友',
    gender: 'male',
    title: null,
    spiritStones: 0,
    silver: 0,
    realm,
    lingyun: 0,
    jadeSlips: 0,
  };
}

/** 与 `zone_houshan` 种子同形：75 / 87 / 99 门槛，3 层，第 3 层 Boss。 */
function zoneRow(overrides: Row = {}): Row {
  return {
    id: 5,
    code: 'zone_houshan',
    name: '后山历练峰',
    chapter: 2,
    order_index: 1,
    min_realm: 1,
    unit_code: 'u_r5_tongmo',
    boss_code: 'u_boss_yaowang',
    base_power: 75,
    power_step: 12,
    max_floor: 3,
    lingyun_bonus_per_floor: 10,
    boss_every_floors: 3,
    require_prev_best_floor: 0,
    tier_bonus_every_floors: 2,
    drop_bonus_every_floors: 2,
    ...overrides,
  };
}

function zoneDb(opts: { zone?: Row; progress?: Row[]; state?: Row[] } = {}) {
  const zone = opts.zone ?? zoneRow();
  return new FakeDatabase()
    .on(/FROM game_zones ORDER BY order_index, id/, { rows: [zone] })
    .on(/FROM game_zones WHERE id = \$1/, { rows: [zone] })
    .on(/FROM game_zones WHERE code = \$1/, { rows: [zone] })
    .on(/FROM game_zone_state WHERE character_id = \$1/, { rows: opts.state ?? [{ current_zone_id: zone.id }] })
    .on(/FROM game_zone_progress WHERE character_id = \$1 AND zone_id = \$2/, { rows: opts.progress ?? [] })
    .on(/FROM game_zone_progress WHERE character_id = \$1$/, { rows: opts.progress ?? [] })
    .on(/COUNT\(\*\)::text AS c FROM game_items/, { rows: [] })
    .on(/COALESCE\(SUM\(level\), 0\)::text AS s/, { rows: [] });
}

function makeService(db: FakeDatabase, realm = 5) {
  const character = makeChar(realm);
  return new ZoneService(
    db as never,
    { findByUserId: stub(async () => character) } as never,
    { settleKills: stub(async () => ({ ok: false, result: { success: false, message: 'x', data: {} } })) } as never,
    new PlayerPowerService(db as never) as never,
    { onZoneFloorPassed: stub(async () => ({ changed: false, nodeCode: null, reason: 'no_map_node' })) } as never,
  );
}

describe('ZoneService.onlineContext（在线 tick 复用既有公式）', () => {
  test('无当前秘境（state 空且无进度）→ null（tick 不推进）', async () => {
    const db = zoneDb({ state: [] });
    const ctx = await makeService(db).onlineContext(11, 5);
    assert.equal(ctx, null);
  });

  test('第 1 层：门槛=base_power，非 Boss 层，用 unit_code', async () => {
    const db = zoneDb();
    const ctx = await makeService(db).onlineContext(11, 5);
    assert.ok(ctx !== null);
    assert.equal(ctx.zoneId, 5);
    assert.equal(ctx.zoneCode, 'zone_houshan');
    assert.equal(ctx.zoneName, '后山历练峰');
    assert.equal(ctx.floor, 1);
    assert.equal(ctx.floorRequirement, 75);
    assert.equal(ctx.isBossFloor, false);
    assert.equal(ctx.unitCode, 'u_r5_tongmo');
    assert.equal(ctx.maxFloor, 3);
    assert.equal(ctx.cleared, false);
    assert.equal(ctx.playerPower, 5 * APP_CONFIG.zonePower.realmWeight);
  });

  test('第 3 层（boss_every_floors=3）：门槛 75+2×12=99、Boss 层、用 boss_code', async () => {
    const db = zoneDb({ progress: [{ id: 1, character_id: 11, zone_id: 5, floor: 3, best_floor: 2, cleared: false }] });
    const ctx = await makeService(db).onlineContext(11, 5);
    assert.equal(ctx?.floor, 3);
    assert.equal(ctx?.floorRequirement, 99);
    assert.equal(ctx?.isBossFloor, true);
    assert.equal(ctx?.unitCode, 'u_boss_yaowang');
    assert.equal(ctx?.bestFloor, 2);
  });

  test('boss_code 缺失：Boss 层也回落 unit_code（不产生 undefined 单位）', async () => {
    const db = zoneDb({
      zone: zoneRow({ boss_code: null }),
      progress: [{ id: 1, character_id: 11, zone_id: 5, floor: 3, best_floor: 0, cleared: false }],
    });
    const ctx = await makeService(db).onlineContext(11, 5);
    assert.equal(ctx?.isBossFloor, false, '没有 boss_code 就不算 Boss 层（既有 isBossFloor 口径）');
    assert.equal(ctx?.unitCode, 'u_r5_tongmo');
  });

  test('层深度加成走既有函数：第 3 层 tierOffset/dropDraw + Boss 额外抽', async () => {
    const db = zoneDb({ progress: [{ id: 1, character_id: 11, zone_id: 5, floor: 3, best_floor: 0, cleared: false }] });
    const ctx = await makeService(db).onlineContext(11, 5);
    // tier_bonus_every_floors=2 → floor((3-1)/2)=1；drop_bonus_every_floors=2 → 1，再 +Boss 额外抽
    assert.equal(ctx?.tierOffsetBonus, 1);
    assert.equal(ctx?.dropDrawBonus, 1 + APP_CONFIG.zoneBossExtraDraws);
    assert.equal(ctx?.lingyunBonusFlat, 30, 'floor × lingyun_bonus_per_floor = 3 × 10');
  });

  test('maxFloor=1 且 boss_every_floors=3：唯一一层不是 Boss 层（无普通层可涨）', async () => {
    const db = zoneDb({ zone: zoneRow({ max_floor: 1 }) });
    const ctx = await makeService(db).onlineContext(11, 5);
    assert.equal(ctx?.maxFloor, 1);
    assert.equal(ctx?.isBossFloor, false);
    assert.equal(ctx?.floorRequirement, 75);
  });
});

describe('ZoneService.advanceFloor（与 challenge 同表同口径）', () => {
  test('普通涨层：floor+1、best_floor 取 max、cleared=false，SQL 参数逐项正确', async () => {
    const db = zoneDb();
    const svc = makeService(db);
    const result = await svc.advanceFloor(11, 5, { floor: 1, bestFloor: 0, maxFloor: 3 });
    assert.deepEqual(result, { floor: 2, bestFloor: 1, cleared: false });
    const call = db.lastCall(/INSERT INTO game_zone_progress/);
    assert.deepEqual(call?.params, [11, 5, 2, 1, false]);
    assert.match(String(call?.sql), /GREATEST\(game_zone_progress\.best_floor, EXCLUDED\.best_floor\)/);
    assert.match(String(call?.sql), /ON CONFLICT \(character_id, zone_id\) DO UPDATE/);
  });

  test('通关：nextFloor > maxFloor → cleared=true 且 floor 停在 maxFloor（不写 4）', async () => {
    const db = zoneDb();
    const result = await makeService(db).advanceFloor(11, 5, { floor: 3, bestFloor: 2, maxFloor: 3 });
    assert.deepEqual(result, { floor: 3, bestFloor: 3, cleared: true });
    assert.deepEqual(db.lastCall(/INSERT INTO game_zone_progress/)?.params, [11, 5, 3, 3, true]);
  });

  test('best_floor 单调：已有更高 best 时不被拉低', async () => {
    const db = zoneDb();
    const result = await makeService(db).advanceFloor(11, 5, { floor: 1, bestFloor: 9, maxFloor: 10 });
    assert.equal(result.bestFloor, 9);
  });

  test('maxFloor=1：首层即通关（floor 保持 1）', async () => {
    const db = zoneDb();
    const result = await makeService(db).advanceFloor(11, 5, { floor: 1, bestFloor: 0, maxFloor: 1 });
    assert.deepEqual(result, { floor: 1, bestFloor: 1, cleared: true });
  });

  test('非法入参不抛（负数层数走既有算术，交由调用方校验）', async () => {
    const db = zoneDb();
    const result = await makeService(db).advanceFloor(11, 5, { floor: 0, bestFloor: 0, maxFloor: 3 });
    assert.equal(result.floor, 1);
    assert.equal(result.cleared, false);
  });
});
