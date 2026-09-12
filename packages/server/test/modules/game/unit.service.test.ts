import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { UnitService } from '../../../src/modules/logic/combat/internal/unit.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';
import type { ItemView } from '../../../src/modules/game/item/item.types.js';
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

function makeUnitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: 'slime',
    name: '史莱姆',
    realm: 1,
    camp: 'hostile',
    gives_lingyun: true,
    base_stats: null as string | null,
    drop_table_ref: null as number | null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 99,
    baseId: 5,
    baseCode: 'sword',
    name: '铁剑',
    category: 'weapon',
    slot: 'weapon',
    rarity: 0,
    rarityName: '凡品',
    tier: 1,
    quality: 0,
    status: 'bag',
    affixTexts: [],
    affixes: [],
    ...overrides,
  };
}

interface ServiceOptions {
  db: FakeDatabase;
  character?: Character | null;
  allow?: boolean;
  generate?: (
    baseId: number,
    rarity: number,
    characterId: number | null,
  ) => Promise<{ success: boolean; message?: string; data?: unknown }>;
}

function makeService(opts: ServiceOptions) {
  const character = opts.character === undefined ? makeChar() : opts.character;
  const charStub = { findByUserId: stub(async () => character) };
  const rateStub = { allow: stub(() => opts.allow ?? true) };
  const statStub = {
    increment: stub(async () => undefined),
    recordKill: stub(async () => undefined),
    readAll: stub(async () => new Map<string, number>()),
  };
  const generate =
    opts.generate ?? (async () => ({ success: true, data: { item: makeItem() } }));
  const affixStub = { generateItem: stub(generate) };
  const svc = new UnitService(
    opts.db as never,
    opts.db as never,
    affixStub as never,
    charStub as never,
    rateStub as never,
    statStub as never,
  );
  return { svc, charStub, rateStub, statStub, affixStub };
}

interface SettleDbOptions {
  table?: Record<string, unknown> | null;
  entries?: Array<Record<string, unknown>>;
  ownRules?: Array<Record<string, unknown>>;
  tplRules?: Array<Record<string, unknown>>;
  bases?: Array<Record<string, unknown>>;
  basesByTier?: Array<Record<string, unknown>>;
  updateRows?: Array<Record<string, unknown>>;
}

function settleDb(unitRow: ReturnType<typeof makeUnitRow> = makeUnitRow(), opts: SettleDbOptions = {}): FakeDatabase {
  // 有掉落表时自动把 unit 的 drop_table_ref 指向该表，否则 loadUnit 不会加载掉落表。
  const effectiveUnit =
    opts.table && unitRow.drop_table_ref == null
      ? { ...unitRow, drop_table_ref: Number(opts.table.id) }
      : unitRow;
  return new FakeDatabase()
    .on(/FROM game_unit_templates WHERE code/, { rows: [effectiveUnit] })
    .on(/FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h/, { rows: [] })
    .on(/FROM game_drop_tables WHERE id/, { rows: opts.table ? [opts.table] : [] })
    .on(/FROM game_drop_entries WHERE drop_table_id/, { rows: opts.entries ?? [] })
    .on(/FROM game_pickup_rules WHERE character_id = \$1 AND enabled/, { rows: opts.ownRules ?? [] })
    .on(/FROM game_pickup_rules WHERE character_id = 0 AND enabled/, { rows: opts.tplRules ?? [] })
    .on(/FROM game_item_bases WHERE id/, { rows: opts.bases ?? [] })
    .on(/FROM game_item_bases WHERE tier/, { rows: opts.basesByTier ?? [] })
    .on(/UPDATE characters SET lingyun/, { rows: opts.updateRows ?? [{ lingyun: '0', spirit_stones: '0' }] });
}

function failingCode(res: { success: boolean; data?: unknown }): string | undefined {
  return (res.data as { code?: string } | undefined)?.code;
}

// ===== 图鉴 =====

describe('UnitService.catalog 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db, character: null });
    const res = await svc.catalog(7, {});
    assert.equal(res.success, false);
    assert.equal(failingCode(res), 'CHARACTER_NOT_FOUND');
    assert.equal(db.callCount, 0);
  });

  test('无数据行 -> total=0 / units=[]', async () => {
    const db = new FakeDatabase().on(/FROM game_unit_templates/, { rows: [] });
    const { svc } = makeService({ db });
    const res = await svc.catalog(7, {});
    assert.equal(res.success, true);
    assert.deepEqual(res.data, { total: 0, units: [] });
  });

  test('单行 -> 映射隐藏池 / 掉落表 / 境界名', async () => {
    const db = new FakeDatabase()
      .on(/FROM game_unit_templates/, { rows: [makeUnitRow({ id: 5, realm: 14, gives_lingyun: false })] })
      .on(/FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h/, { rows: [{ unit_template_id: 5, code: 'H1' }] })
      .on(/SELECT id, code FROM game_drop_tables/, { rows: [] });
    const { svc } = makeService({ db });
    const data = (await svc.catalog(7, {})).data as { total: number; units: Array<Record<string, unknown>> };
    assert.equal(data.total, 1);
    assert.equal(data.units[0].realmName, '合道');
    assert.deepEqual(data.units[0].hiddenPool, ['H1']);
    assert.equal(data.units[0].lingyunReward, 0);
  });

  test('realm/camp 过滤 -> 原样拼 SQL 参数（realm 1 与 14 均透传）', async () => {
    const db = new FakeDatabase().on(/FROM game_unit_templates/, { rows: [] });
    const { svc } = makeService({ db });
    await svc.catalog(7, { realm: 1, camp: 'hostile' });
    let call = db.lastCall(/FROM game_unit_templates/);
    assert.match(call?.sql ?? '', /WHERE realm = \$1 AND camp = \$2/);
    assert.deepEqual(call?.params, [1, 'hostile']);
    await svc.catalog(7, { realm: 14 });
    call = db.lastCall(/FROM game_unit_templates/);
    assert.match(call?.sql ?? '', /WHERE realm = \$1 ORDER BY realm, id/);
    assert.deepEqual(call?.params, [14]);
  });

  // UnitService.catalog 不做 realm 1~14 / camp 白名单校验：越界值原样进 SQL。
  // 这两个校验目前位于 logic/combat/combat.action.ts（realm 需 1~14、camp ∈ UNIT_CAMPS），
  // 不在本次分配的服务文件内，故此处只记录透传行为。
  test('realm=0 / camp 非法值无白名单校验，原样透传', async () => {
    const db = new FakeDatabase().on(/FROM game_unit_templates/, { rows: [] });
    const { svc } = makeService({ db });
    await svc.catalog(7, { realm: 0, camp: 'not-a-camp' });
    const call = db.lastCall(/FROM game_unit_templates/);
    assert.deepEqual(call?.params, [0, 'not-a-camp']);
  });

  test('base_stats 非法 JSON -> 回退境界基础模板；合法 JSON 覆盖', async () => {
    const db = new FakeDatabase()
      .on(/FROM game_unit_templates/, {
        rows: [
          makeUnitRow({ id: 1, code: 'a', base_stats: 'not-json' }),
          makeUnitRow({ id: 2, code: 'b', base_stats: '{"hp":123}' }),
        ],
      })
      .on(/FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h/, { rows: [] })
      .on(/SELECT id, code FROM game_drop_tables/, { rows: [] });
    const { svc } = makeService({ db });
    const data = (await svc.catalog(7, {})).data as { units: Array<Record<string, unknown>> };
    assert.equal((data.units[0].baseStats as Record<string, number>).hp, 60);
    assert.equal((data.units[1].baseStats as Record<string, number>).hp, 123);
  });

  test('DB 抛错 -> 向上抛出', async () => {
    const db = new FakeDatabase().onFallback(() => {
      throw new Error('db down');
    });
    const { svc } = makeService({ db });
    await assert.rejects(svc.catalog(7, {}), /db down/);
  });
});

describe('UnitService.dropTables 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db, character: null });
    const res = await svc.dropTables(7);
    assert.equal(res.success, false);
  });

  test('无行 -> total=0', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db });
    const res = await svc.dropTables(7);
    assert.deepEqual(res.data, { total: 0, tables: [] });
  });

  test('表 + 条目 -> 按 drop_table_id 分组', async () => {
    const db = new FakeDatabase()
      .on(/FROM game_drop_tables ORDER BY id/, {
        rows: [
          { id: 1, code: 'dt1', name: '表1', drops_per_kill: 2, tier_offset: 1 },
          { id: 2, code: 'dt2', name: '表2', drops_per_kill: 1, tier_offset: 0 },
        ],
      })
      .on(/FROM game_drop_entries ORDER BY id/, {
        rows: [
          { id: 1, drop_table_id: 1, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 },
          { id: 2, drop_table_id: 2, kind: 'currency', base_id: null, base_tier: null, rarity: null, currency_code: 'gold', essence_code: null, min_count: 1, max_count: 2, weight: 3 },
        ],
      });
    const { svc } = makeService({ db });
    const data = (await svc.dropTables(7)).data as { total: number; tables: Array<{ code: string; entries: unknown[] }> };
    assert.equal(data.total, 2);
    assert.equal(data.tables[0].entries.length, 1);
    assert.equal(data.tables[1].entries.length, 1);
  });
});

// ===== 即时实例化 =====

describe('UnitService.spawn 边界', () => {
  test('生产环境 -> FORBIDDEN（不触达 DB）', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const db = new FakeDatabase();
      const { svc } = makeService({ db });
      const res = await svc.spawn(7, 'slime');
      assert.equal(failingCode(res), 'FORBIDDEN');
      assert.equal(db.callCount, 0);
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db, character: null });
    const res = await svc.spawn(7, 'slime');
    assert.equal(failingCode(res), 'CHARACTER_NOT_FOUND');
  });

  test('hiddenCount 边界：-1 / 7 / 1.5 / NaN / Infinity -> INVALID_PARAM 且不触达限流', async () => {
    for (const hiddenCount of [-1, 7, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const db = new FakeDatabase();
      const { svc, rateStub } = makeService({ db });
      const res = await svc.spawn(7, 'slime', hiddenCount);
      assert.equal(failingCode(res), 'INVALID_PARAM', 'hiddenCount=' + String(hiddenCount));
      assert.equal(rateStub.allow.callCount, 0);
      assert.equal(db.callCount, 0);
    }
  });

  test('hiddenCount=0 与 6（上下界）-> 有效，词条数受池大小限制', async () => {
    const pool = [1, 2, 3, 4, 5, 6].map((i) => ({ id: i, code: 'H' + i, name: 'h' + i, effects: '{}', weight: 1 }));
    const db = new FakeDatabase()
      .on(/FROM game_unit_templates WHERE code/, { rows: [makeUnitRow()] })
      .on(/FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h/, { rows: pool });
    const { svc } = makeService({ db });
    const zero = (await svc.spawn(7, 'slime', 0)).data as { unit: { hiddenAffixes: unknown[] } };
    assert.equal(zero.unit.hiddenAffixes.length, 0);
    const six = (await svc.spawn(7, 'slime', 6)).data as { unit: { hiddenAffixes: unknown[] } };
    assert.equal(six.unit.hiddenAffixes.length, 6);
  });

  test('hiddenCount 缺省 -> 用配置区间 [1,3] 随机', async () => {
    const pool = [1, 2, 3, 4, 5, 6].map((i) => ({ id: i, code: 'H' + i, name: 'h' + i, effects: '{}', weight: 1 }));
    const db = new FakeDatabase()
      .on(/FROM game_unit_templates WHERE code/, { rows: [makeUnitRow()] })
      .on(/FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h/, { rows: pool });
    const { svc } = makeService({ db });
    const data = (await svc.spawn(7, 'slime')).data as { unit: { hiddenAffixes: unknown[] } };
    assert.ok(data.unit.hiddenAffixes.length >= APP_CONFIG.unitHiddenAffixCount[0]);
    assert.ok(data.unit.hiddenAffixes.length <= APP_CONFIG.unitHiddenAffixCount[1]);
  });

  test('限流命中 -> RATE_LIMITED（loadUnit 之前）', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db, allow: false });
    const res = await svc.spawn(7, 'slime');
    assert.equal(failingCode(res), 'RATE_LIMITED');
    assert.equal(db.callCount, 0);
  });

  test('code 空串 / 纯空白 -> 原样查询后 UNIT_NOT_FOUND', async () => {
    for (const code of ['', '   ']) {
      const db = new FakeDatabase().on(/FROM game_unit_templates WHERE code/, { rows: [] });
      const { svc } = makeService({ db });
      const res = await svc.spawn(7, code);
      assert.equal(failingCode(res), 'UNIT_NOT_FOUND');
      assert.deepEqual(db.lastCall(/FROM game_unit_templates WHERE code/)?.params, [code]);
    }
  });

  test('realm=14 -> 合道；realm=0 -> 未知（spawn 不做 1~14 校验）', async () => {
    for (const [realm, name] of [[14, '合道'], [0, '未知']] as Array<[number, string]>) {
      const db = new FakeDatabase()
        .on(/FROM game_unit_templates WHERE code/, { rows: [makeUnitRow({ realm })] })
        .on(/FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h/, { rows: [] });
      const { svc } = makeService({ db });
      const data = (await svc.spawn(7, 'slime', 0)).data as { unit: { realmName: string } };
      assert.equal(data.unit.realmName, name);
    }
  });

  test('base_stats 覆盖 + lingyunGain% -> 灵韵奖励计算', async () => {
    const db = new FakeDatabase()
      .on(/FROM game_unit_templates WHERE code/, { rows: [makeUnitRow({ base_stats: '{"hp":123,"lingyunGain":50}' })] })
      .on(/FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h/, { rows: [] });
    const { svc } = makeService({ db });
    const data = (await svc.spawn(7, 'slime', 0)).data as {
      unit: { baseStats: Record<string, number>; finalStats: Record<string, number>; lingyunReward: number };
    };
    assert.equal(data.unit.baseStats.hp, 123);
    // realmLingyun(1)=5，+50% => round(7.5)=8
    assert.equal(data.unit.lingyunReward, 8);
  });
});

// ===== 击杀（dev 门面） =====

describe('UnitService.kill 边界', () => {
  test('生产环境 -> FORBIDDEN', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const db = new FakeDatabase();
      const { svc } = makeService({ db });
      assert.equal(failingCode(await svc.kill(7, 'slime')), 'FORBIDDEN');
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db, character: null });
    assert.equal(failingCode(await svc.kill(7, 'slime')), 'CHARACTER_NOT_FOUND');
  });

  test('count 边界：0 / -1 / 1.5 / NaN / Infinity / max+1 -> INVALID_PARAM 且不限流', async () => {
    const bad = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, APP_CONFIG.maxKillsPerRequest + 1];
    for (const count of bad) {
      const db = new FakeDatabase();
      const { svc, rateStub } = makeService({ db });
      const res = await svc.kill(7, 'slime', count);
      assert.equal(failingCode(res), 'INVALID_PARAM', 'count=' + String(count));
      assert.equal(rateStub.allow.callCount, 0);
      assert.equal(db.callCount, 0);
    }
  });

  test('count 缺省 -> 默认 1；count=maxKillsPerRequest -> 成功', async () => {
    const db = settleDb(makeUnitRow(), { updateRows: [{ lingyun: '5', spirit_stones: '0' }] });
    const { svc } = makeService({ db });
    const one = await svc.kill(7, 'slime');
    assert.equal(one.success, true);
    assert.match(one.message, /×1/);

    const db2 = settleDb(makeUnitRow(), { updateRows: [{ lingyun: '250', spirit_stones: '0' }] });
    const { svc: svc2 } = makeService({ db: db2 });
    const many = await svc2.kill(7, 'slime', APP_CONFIG.maxKillsPerRequest);
    assert.equal(many.success, true);
    assert.match(many.message, new RegExp('×' + APP_CONFIG.maxKillsPerRequest));
  });

  test('限流命中 -> RATE_LIMITED', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db, allow: false });
    assert.equal(failingCode(await svc.kill(7, 'slime', 1)), 'RATE_LIMITED');
    assert.equal(db.callCount, 0);
  });

  test('单位不存在 / 非敌对 -> 透传 settleKills 失败', async () => {
    const notFound = new FakeDatabase().on(/FROM game_unit_templates WHERE code/, { rows: [] });
    const { svc } = makeService({ db: notFound });
    assert.equal(failingCode(await svc.kill(7, 'nope')), 'UNIT_NOT_FOUND');

    const nonHostile = settleDb(makeUnitRow({ camp: 'neutral' }));
    const { svc: svc2 } = makeService({ db: nonHostile });
    assert.equal(failingCode(await svc2.kill(7, 'slime')), 'NOT_KILLABLE');
  });
});

// ===== 击杀结算核心 =====

describe('UnitService.settleKills 边界', () => {
  test('单位不存在 -> UNIT_NOT_FOUND', async () => {
    const db = new FakeDatabase().on(/FROM game_unit_templates WHERE code/, { rows: [] });
    const { svc } = makeService({ db });
    const res = await svc.settleKills(11, 'nope', 1);
    assert.equal(res.ok, false);
    if (res.ok) assert.fail('unreachable');
    assert.equal((res.result.data as { code: string }).code, 'UNIT_NOT_FOUND');
  });

  test('非敌对单位 -> NOT_KILLABLE', async () => {
    const db = settleDb(makeUnitRow({ camp: 'friendly' }));
    const { svc } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    assert.equal(res.ok, false);
    if (res.ok) assert.fail('unreachable');
    assert.equal((res.result.data as { code: string }).code, 'NOT_KILLABLE');
  });

  test('count=1 无掉落：灵韵 = realm 基值，写击杀计数与角色总账', async () => {
    const db = settleDb(makeUnitRow(), { updateRows: [{ lingyun: '105', spirit_stones: '3' }] });
    const { svc, statStub } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.lingyunGained, 5);
    assert.equal(res.data.lingyunTotal, 105);
    assert.equal(res.data.kills, 1);
    assert.equal(res.data.items.length, 0);
    assert.deepEqual(statStub.recordKill.last, [11, 'slime', 1, 1]);
    assert.equal(db.callsMatching(/UPDATE characters SET lingyun/).length, 1);
  });

  test('count=0 -> 仍写一次 recordKill（count=0）并刷新角色总账', async () => {
    const db = settleDb(makeUnitRow(), { updateRows: [{ lingyun: '100', spirit_stones: '0' }] });
    const { svc, statStub } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 0);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.kills, 0);
    assert.equal(res.data.lingyunGained, 0);
    assert.deepEqual(statStub.recordKill.last, [11, 'slime', 1, 0]);
    assert.equal(db.callsMatching(/UPDATE characters SET lingyun/).length, 1);
  });

  test('gives_lingyun=false -> 灵韵为 0；userDb 无返回行 -> lingyunTotal=0', async () => {
    const db = settleDb(makeUnitRow({ gives_lingyun: false }), { updateRows: [] });
    const { svc } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.lingyunGained, 0);
    assert.equal(res.data.lingyunTotal, 0);
  });

  test('lingyunBonusFlat -> 叠加到收益', async () => {
    const db = settleDb(makeUnitRow(), { updateRows: [{ lingyun: '112', spirit_stones: '0' }] });
    const { svc } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1, { lingyunBonusFlat: 7 });
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.lingyunGained, 12);
  });

  test('base 掉落 + 无规则 -> 回退 salvage：删除并返还 tier×2×(rarity+1) 灵韵', async () => {
    const item = makeItem({ id: 99, tier: 1, rarity: 0 });
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 1, drop_weight: 1 }],
      updateRows: [{ lingyun: '107', spirit_stones: '0' }],
    });
    const { svc } = makeService({ db, generate: async () => ({ success: true, data: { item } }) });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.lingyunGained, 7); // 5 + 2
    assert.equal(res.data.salvaged.count, 1);
    assert.equal(res.data.salvaged.lingyun, 2);
    assert.equal(res.data.itemsProduced, 1);
    assert.equal(db.callsMatching(/DELETE FROM game_items/).length, 1);
  });

  test('辨宝规则 keep -> 保留物品，不删除', async () => {
    const item = makeItem({ id: 99, tier: 1, rarity: 0 });
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 1, drop_weight: 1 }],
      ownRules: [{ id: 1, character_id: 11, name: 'keep', rarity_min: 0, tier_min: 0, affix_codes: null, action: 'keep', enabled: true, priority: 0 }],
    });
    const { svc } = makeService({ db, generate: async () => ({ success: true, data: { item } }) });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.kept, 1);
    assert.equal(res.data.items.length, 1);
    assert.equal(res.data.items[0].id, 99);
    assert.equal(db.callsMatching(/DELETE FROM game_items/).length, 0);
  });

  test('辨宝规则 affix_codes 不匹配 -> 跳过该规则，回退 salvage', async () => {
    const item = makeItem({ id: 99, tier: 1, rarity: 0, affixes: [] });
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 1, drop_weight: 1 }],
      ownRules: [{ id: 1, character_id: 11, name: 'need-fire', rarity_min: 0, tier_min: 0, affix_codes: '["FIRE"]', action: 'keep', enabled: true, priority: 0 }],
    });
    const { svc } = makeService({ db, generate: async () => ({ success: true, data: { item } }) });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.kept, 0);
    assert.equal(res.data.salvaged.count, 1);
  });

  test('辨宝规则 sell / discard -> 计数与灵石收益正确', async () => {
    const item = makeItem({ id: 99, tier: 2, rarity: 1 });
    const make = (action: string) =>
      settleDb(makeUnitRow({ realm: 3 }), {
        table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
        entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 1, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
        bases: [{ id: 5, tier: 2, drop_weight: 1 }],
        ownRules: [{ id: 1, character_id: 11, name: action, rarity_min: 0, tier_min: 0, affix_codes: null, action, enabled: true, priority: 0 }],
      });
    const sellDb = make('sell');
    const sellSvc = makeService({ db: sellDb, generate: async () => ({ success: true, data: { item } }) }).svc;
    const sold = await sellSvc.settleKills(11, 'slime', 1);
    if (!sold.ok) assert.fail('expected ok');
    assert.equal(sold.data.sold.count, 1);
    assert.equal(sold.data.sold.spiritStones, 2 * APP_CONFIG.lootSellSpiritStonesPerTier * 2);
    assert.equal(sellDb.lastCall(/UPDATE characters SET lingyun/)?.params[1], sold.data.sold.spiritStones);

    const discardDb = make('discard');
    const discardSvc = makeService({ db: discardDb, generate: async () => ({ success: true, data: { item } }) }).svc;
    const discarded = await discardSvc.settleKills(11, 'slime', 1);
    if (!discarded.ok) assert.fail('expected ok');
    assert.equal(discarded.data.discarded, 1);
    assert.equal(discarded.data.kept, 0);
  });

  test('掉落基础 tier 超出 realm+tierOffset -> blockedByTier，不生成物品', async () => {
    const db = settleDb(makeUnitRow({ realm: 1 }), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 5, drop_weight: 1 }],
    });
    const { svc, affixStub } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.blockedByTier, 1);
    assert.equal(res.data.itemsProduced, 0);
    assert.equal(affixStub.generateItem.callCount, 0);
  });

  test('tierOffsetBonus 抬升可掉落 tier 上限', async () => {
    const db = settleDb(makeUnitRow({ realm: 1 }), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 2, drop_weight: 1 }],
    });
    const { svc } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1, { tierOffsetBonus: 1 });
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.blockedByTier, 0);
    assert.equal(res.data.itemsProduced, 1);
  });

  test('itemBudget 恰好用尽 -> 后续 base 不再生成；灵韵/通货照常', async () => {
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 2, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 1, drop_weight: 1 }],
    });
    const { svc, affixStub } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1, { itemBudget: 1 });
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.itemsProduced, 1);
    assert.equal(affixStub.generateItem.callCount, 1);
    // 5 灵韵（realm1 基值）+ 1 件 base 回退 salvage 的 2 灵韵
    assert.equal(res.data.lingyunGained, 7);
    assert.equal(res.data.salvaged.count, 1);
  });

  test('itemBudget=0 -> 完全不生成物品', async () => {
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 1, drop_weight: 1 }],
    });
    const { svc, affixStub } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1, { itemBudget: 0 });
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.itemsProduced, 0);
    assert.equal(affixStub.generateItem.callCount, 0);
  });

  test('通货掉落 -> 写钱包（金额取 min/max 区间）', async () => {
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [
        { id: 1, drop_table_id: 10, kind: 'currency', base_id: null, base_tier: null, rarity: null, currency_code: 'gold', essence_code: null, min_count: 2, max_count: 2, weight: 1 },
      ],
    });
    const { svc } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    const wallets = db.callsMatching(/INSERT INTO game_wallets/);
    assert.equal(wallets.length, 1);
    assert.deepEqual(wallets[0].params, [11, 'gold', 2]);
    assert.equal(res.data.currencies.gold, 2);
  });

  test('精华掉落 -> 写精华库存', async () => {
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [
        { id: 2, drop_table_id: 10, kind: 'essence', base_id: null, base_tier: null, rarity: null, currency_code: null, essence_code: 'e1', min_count: 3, max_count: 3, weight: 1 },
      ],
    });
    const { svc } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    const essences = db.callsMatching(/INSERT INTO game_essence_inventory/);
    assert.equal(essences.length, 1);
    assert.deepEqual(essences[0].params, [11, 'e1', 3]);
    assert.equal(res.data.essences.e1, 3);
  });

  test('base_id 缺失但 base_tier 存在 -> 按 tier 加权抽取基底', async () => {
    const db = settleDb(makeUnitRow({ realm: 3 }), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: null, base_tier: 2, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      basesByTier: [{ id: 7, tier: 2, drop_weight: 10 }],
    });
    const { svc, affixStub } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.itemsProduced, 1);
    assert.equal(affixStub.generateItem.last?.[0], 7);
    assert.equal(db.callsMatching(/FROM game_item_bases WHERE tier/).length, 1);
  });

  test('base_id 与 base_tier 均缺失 -> pickBase 返回 null，跳过该掉落', async () => {
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: null, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
    });
    const { svc, affixStub } = makeService({ db });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.itemsProduced, 0);
    assert.equal(affixStub.generateItem.callCount, 0);
  });

  test('base_id 查询结果被缓存：第二次结算不再查基底表', async () => {
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 1, drop_weight: 1 }],
    });
    const { svc } = makeService({ db });
    await svc.settleKills(11, 'slime', 1);
    await svc.settleKills(11, 'slime', 1);
    assert.equal(db.callsMatching(/FROM game_item_bases WHERE id/).length, 1);
  });

  test('generateItem 失败 -> 不计入 itemsProduced', async () => {
    const db = settleDb(makeUnitRow(), {
      table: { id: 10, code: 't', name: 'T', drops_per_kill: 1, tier_offset: 0 },
      entries: [{ id: 1, drop_table_id: 10, kind: 'base', base_id: 5, base_tier: null, rarity: 0, currency_code: null, essence_code: null, min_count: 1, max_count: 1, weight: 1 }],
      bases: [{ id: 5, tier: 1, drop_weight: 1 }],
    });
    const { svc } = makeService({ db, generate: async () => ({ success: false, message: 'nope' }) });
    const res = await svc.settleKills(11, 'slime', 1);
    if (!res.ok) assert.fail('expected ok');
    assert.equal(res.data.itemsProduced, 0);
  });
});
