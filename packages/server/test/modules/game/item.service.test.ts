/**
 * ItemService 边界测试（背包 / 详情 / 装备 / 卸下 / 丢弃 / 装备栏 / 基底库 / 生成门禁 / 拾取规则）
 *
 * 构造方式：绝不使用 NestJS 容器，全部手动 new（esbuild 不产出 design:paramtypes）。
 * 事务：FakeDatabase 只实现 query，这里在测试内为实例补一个 withTransaction（tx === fake）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ItemService } from '../../../src/modules/game/item/item.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';

type Result = { success: boolean; message: string; data?: unknown };
const payload = <T>(res: Result): T => res.data as T;
const codeOf = (res: Result): string => (res.data as { code?: string } | undefined)?.code ?? '';

/** 给 FakeDatabase 补上 withTransaction（tx 即 fake 自身），不修改 helpers。 */
function attachTx(fake: FakeDatabase): FakeDatabase {
  const db = fake as unknown as FakeDatabase & {
    withTransaction<T>(fn: (tx: FakeDatabase) => Promise<T>): Promise<T>;
  };
  db.withTransaction = <T>(fn: (tx: FakeDatabase) => Promise<T>) => fn(fake);
  return fake;
}

interface Character {
  id: number;
  realm: number;
  lingyun: number;
}
const CHAR: Character = { id: 5, realm: 5, lingyun: 100 };

function itemRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 11,
    character_id: 5,
    base_id: 2,
    rarity: 1,
    tier: 3,
    quality: 0,
    affixes: '[]',
    status: 'bag',
    created_at: '2025-01-01T00:00:00.000Z',
    code: 'sword',
    base_name: '铁剑',
    category: 'weapon',
    slot: 'weapon',
    ...over,
  };
}

function makeService(opts: {
  fake: FakeDatabase;
  character?: Character | null;
  allow?: boolean;
  generateItemResult?: unknown;
}): {
  svc: ItemService;
  rate: ReturnType<typeof stub>;
  character: ReturnType<typeof stub>;
  affix: Record<string, ReturnType<typeof stub>>;
} {
  const character = opts.character === undefined ? CHAR : opts.character;
  const characterStub = stub(() => character);
  const rate = stub(() => opts.allow ?? true);
  const affix = {
    generateItem: stub(
      (baseId: number, rarity: number, characterId: number | null) =>
        opts.generateItemResult ?? { success: true, message: 'gen', data: { baseId, rarity, characterId } },
    ),
    renderItem: stub((...args: unknown[]) => ({ id: Number(args[0]), args })),
  };
  const svc = new ItemService(
    opts.fake as never,
    affix as never,
    { findByUserId: characterStub } as never,
    { allow: rate } as never,
  );
  return { svc, rate, character: characterStub, affix };
}

describe('ItemService.inventory 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND，且不触达 game 库', async () => {
    const fake = new FakeDatabase();
    const { svc } = makeService({ fake, character: null });
    const res = await svc.inventory(7, {});
    assert.equal(res.success, false);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(fake.callCount, 0);
  });

  test('COUNT 无行 -> total=0、items=[]', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [] })
      .on(/ORDER BY i\.id DESC/, { rows: [] });
    const res = await makeService({ fake }).svc.inventory(7, {});
    const d = payload<{ total: number; page: number; pageSize: number; items: unknown[] }>(res);
    assert.equal(d.total, 0);
    assert.deepEqual(d.items, []);
  });

  test('COUNT 单行 -> total 取 count 字段', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '7' }] })
      .on(/ORDER BY i\.id DESC/, { rows: [] });
    const res = await makeService({ fake }).svc.inventory(7, {});
    assert.equal(payload<{ total: number }>(res).total, 7);
  });

  test('过滤缺省：仅 character_id 条件，默认 page=1/pageSize=20/offset=0', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/ORDER BY i\.id DESC/, { rows: [] });
    await makeService({ fake }).svc.inventory(7, {});
    const countCall = fake.lastCall(/COUNT\(\*\)/);
    assert.deepEqual(countCall?.params, [5]);
    assert.match(countCall?.sql ?? '', /i\.character_id = \$1/);
    assert.doesNotMatch(countCall?.sql ?? '', /b\.category/);
    assert.doesNotMatch(countCall?.sql ?? '', /i\.rarity/);
    assert.deepEqual(fake.lastCall(/ORDER BY i\.id DESC/)?.params, [5, 20, 0]);
  });

  test('rarity=0 / tierMin=0 不被当作缺省（下界）', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/ORDER BY i\.id DESC/, { rows: [] });
    await makeService({ fake }).svc.inventory(7, { rarity: 0, tierMin: 0 });
    const list = fake.lastCall(/ORDER BY i\.id DESC/);
    assert.deepEqual(list?.params, [5, 0, 0, 20, 0]);
    assert.match(list?.sql ?? '', /i\.rarity = \$2/);
    assert.match(list?.sql ?? '', /i\.tier >= \$3/);
  });

  test('category / rarity / tierMin / tierMax 全部参与 WHERE 与参数序号', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/ORDER BY i\.id DESC/, { rows: [] });
    await makeService({ fake }).svc.inventory(7, { category: 'weapon', rarity: 2, tierMin: 1, tierMax: 9 });
    const list = fake.lastCall(/ORDER BY i\.id DESC/);
    assert.deepEqual(list?.params, [5, 'weapon', 2, 1, 9, 20, 0]);
    assert.match(list?.sql ?? '', /b\.category = \$2/);
    assert.match(list?.sql ?? '', /i\.tier <= \$5/);
  });

  const pageCases: Array<[number, number]> = [
    [0, 1],
    [-5, 1],
    [1, 1],
    [2, 2],
    [1.9, 1],
  ];
  for (const [input, expected] of pageCases) {
    test('page=' + input + ' -> page=' + expected + ' 且 offset=(page-1)*pageSize', async () => {
      const fake = new FakeDatabase()
        .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
        .on(/ORDER BY i\.id DESC/, { rows: [] });
      const res = await makeService({ fake }).svc.inventory(7, { page: input, pageSize: 10 });
      assert.equal(payload<{ page: number }>(res).page, expected);
      assert.deepEqual(fake.lastCall(/ORDER BY i\.id DESC/)?.params, [5, 10, (expected - 1) * 10]);
    });
  }

  test('page=NaN 当前未归一（Math.max(1, NaN)=NaN，实测观察）', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/ORDER BY i\.id DESC/, { rows: [] });
    const res = await makeService({ fake }).svc.inventory(7, { page: Number.NaN });
    // 实现只做 Math.max(1, floor(x))，NaN 会穿透；这里锁定当前行为而非期望“已归一”
    assert.ok(Number.isNaN(payload<{ page: number }>(res).page));
    assert.ok(Number.isNaN(fake.lastCall(/ORDER BY i\.id DESC/)?.params[2] as number));
  });

  const sizeCases: Array<[number, number]> = [
    [0, 1],
    [-1, 1],
    [1, 1],
    [20, 20],
    [100, 100],
    [101, 100],
    [99999, 100],
  ];
  for (const [input, expected] of sizeCases) {
    test('pageSize=' + input + ' -> pageSize=' + expected + '（上限 100）', async () => {
      const fake = new FakeDatabase()
        .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
        .on(/ORDER BY i\.id DESC/, { rows: [] });
      const res = await makeService({ fake }).svc.inventory(7, { pageSize: input });
      assert.equal(payload<{ pageSize: number }>(res).pageSize, expected);
      assert.equal(fake.lastCall(/ORDER BY i\.id DESC/)?.params[1], expected);
    });
  }

  test('pageSize=NaN 当前未归一（边界观察）', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/ORDER BY i\.id DESC/, { rows: [] });
    const res = await makeService({ fake }).svc.inventory(7, { pageSize: Number.NaN });
    assert.ok(Number.isNaN(payload<{ pageSize: number }>(res).pageSize));
  });

  test('多行 -> 每行都调用 renderItem，且 affixes 非法 JSON 按空词条渲染', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '2' }] })
      .on(/ORDER BY i\.id DESC/, {
        rows: [itemRow({ id: 1, affixes: '{bad' }), itemRow({ id: 2, affixes: '[]' })],
      });
    const { svc, affix } = makeService({ fake });
    const res = await svc.inventory(7, {});
    assert.equal(payload<{ items: unknown[] }>(res).items.length, 2);
    assert.equal(affix.renderItem.callCount, 2);
    // renderItem 第 11 个参数（索引 10）为 entries
    assert.deepEqual(affix.renderItem.calls[0][10], []);
  });

  test('COUNT 查询抛错 -> Promise reject（服务无内部超时/降级）', async () => {
    const fake = new FakeDatabase().on(/COUNT\(\*\)/, () => {
      throw new Error('db down');
    });
    await assert.rejects(() => makeService({ fake }).svc.inventory(7, {}), /db down/);
  });
});

describe('ItemService.detail 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.detail(7, 1);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(fake.callCount, 0);
  });

  test('SQL 无行 -> ITEM_NOT_FOUND', async () => {
    const fake = new FakeDatabase().on(/FROM game_items i/, { rows: [] });
    const res = await makeService({ fake }).svc.detail(7, 1);
    assert.equal(codeOf(res), 'ITEM_NOT_FOUND');
  });

  test('物品归属他人 -> ITEM_NOT_OWNED', async () => {
    const fake = new FakeDatabase().on(/FROM game_items i/, { rows: [itemRow({ character_id: 99 })] });
    const res = await makeService({ fake }).svc.detail(7, 1);
    assert.equal(codeOf(res), 'ITEM_NOT_OWNED');
  });

  test('成功 -> 渲染 ItemView，字段转 number', async () => {
    const fake = new FakeDatabase().on(/FROM game_items i/, { rows: [itemRow()] });
    const { svc, affix } = makeService({ fake });
    const res = await svc.detail(7, 11);
    assert.equal(res.success, true);
    assert.equal(affix.renderItem.callCount, 1);
    assert.equal(affix.renderItem.last?.[0], 11);
    assert.equal(affix.renderItem.last?.[6], 1);
    assert.equal(affix.renderItem.last?.[7], 3);
    assert.ok(payload<{ item: unknown }>(res).item);
  });
});

describe('ItemService.equip 边界', () => {
  function equipFake(
    itemOver: Record<string, unknown>,
    opts: { slots?: string; equipRowMissing?: boolean } = {},
  ): FakeDatabase {
    const fake = new FakeDatabase()
      .on(/FROM game_items i/, { rows: [itemRow(itemOver)] })
      .on(/INSERT INTO game_equipment/, { rows: [] })
      .on(/FROM game_equipment/, {
        rows: opts.equipRowMissing
          ? []
          : [{ id: 1, slots: opts.slots ?? JSON.stringify({ weapon: null, ring1: null, ring2: null }) }],
      })
      .on(/UPDATE game_equipment/, { rows: [] })
      .on(/UPDATE game_items/, { rows: [] });
    return attachTx(fake);
  }

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = attachTx(new FakeDatabase());
    const res = await makeService({ fake, character: null }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(fake.callCount, 0);
  });

  test('物品不存在 -> ITEM_NOT_FOUND', async () => {
    const fake = attachTx(new FakeDatabase().on(/FROM game_items i/, { rows: [] }));
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_FOUND');
  });

  test('物品归属他人 -> ITEM_NOT_OWNED', async () => {
    const fake = attachTx(
      new FakeDatabase().on(/FROM game_items i/, { rows: [itemRow({ character_id: 99 })] }),
    );
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_OWNED');
  });

  test('status=equipped -> ITEM_NOT_IN_BAG', async () => {
    const fake = equipFake({ status: 'equipped' });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_IN_BAG');
  });

  test('tier=realm（恰好等于）-> 可装备', async () => {
    const fake = equipFake({ tier: 5, slot: 'weapon' });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(res.success, true);
  });

  test('tier=realm+1 -> TIER_TOO_HIGH', async () => {
    const fake = equipFake({ tier: 6, slot: 'weapon' });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'TIER_TOO_HIGH');
    assert.match(res.message, /T6/);
  });

  test('slot=null -> ITEM_NOT_IN_BAG（无合法槽位）', async () => {
    const fake = equipFake({ slot: null });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_IN_BAG');
    assert.match(res.message, /槽位/);
  });

  test('slot=未知值 -> ITEM_NOT_IN_BAG', async () => {
    const fake = equipFake({ slot: 'unknown' });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_IN_BAG');
  });

  test('普通槽位已被占用 -> SLOT_OCCUPIED', async () => {
    const fake = equipFake({ slot: 'weapon' }, { slots: JSON.stringify({ weapon: 3 }) });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'SLOT_OCCUPIED');
  });

  test('ring：ring1 已占用 -> 自动分配到 ring2', async () => {
    const fake = equipFake({ slot: 'ring' }, { slots: JSON.stringify({ ring1: 99, ring2: null }) });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(res.success, true);
    assert.equal(payload<{ slot: string }>(res).slot, 'ring2');
    const slots = JSON.parse(String(fake.lastCall(/UPDATE game_equipment/)?.params[0]));
    assert.equal(slots.ring2, 11);
  });

  test('ring：两槽均满 -> SLOT_OCCUPIED', async () => {
    const fake = equipFake({ slot: 'ring' }, { slots: JSON.stringify({ ring1: 98, ring2: 99 }) });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'SLOT_OCCUPIED');
    assert.match(res.message, /戒指/);
  });

  test('装备栏初始化失败（SELECT 无行）-> ITEM_NOT_IN_BAG', async () => {
    const fake = equipFake({ slot: 'weapon' }, { equipRowMissing: true });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_IN_BAG');
    assert.match(res.message, /装备栏初始化失败/);
  });

  test('slots 非法 JSON -> 按空栏处理并成功', async () => {
    const fake = equipFake({ slot: 'weapon' }, { slots: '{bad' });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(res.success, true);
  });

  test('成功装备 -> slots 落库 + game_items 状态置 equipped', async () => {
    const fake = equipFake({ id: 11, slot: 'weapon' });
    const res = await makeService({ fake }).svc.equip(7, 11);
    assert.equal(res.success, true);
    const slots = JSON.parse(String(fake.lastCall(/UPDATE game_equipment/)?.params[0]));
    assert.equal(slots.weapon, 11);
    assert.deepEqual(fake.lastCall(/UPDATE game_items/)?.params, [11]);
    assert.match(fake.lastCall(/UPDATE game_items/)?.sql ?? '', /status = 'equipped'/);
  });

  test('事务内 DB 抛错 -> Promise reject', async () => {
    const fake = attachTx(
      new FakeDatabase().on(/FROM game_items i/, () => {
        throw new Error('tx boom');
      }),
    );
    await assert.rejects(() => makeService({ fake }).svc.equip(7, 11), /tx boom/);
  });
});

describe('ItemService.unequip 边界', () => {
  function unequipFake(
    itemOver: Record<string, unknown>,
    opts: { equipRowMissing?: boolean; slots?: string | null } = {},
  ): FakeDatabase {
    const fake = new FakeDatabase()
      .on(/FROM game_items i/, { rows: [itemRow(itemOver)] })
      .on(/FROM game_equipment/, {
        rows: opts.equipRowMissing ? [] : [{ id: 1, slots: opts.slots ?? JSON.stringify({ weapon: 11 }) }],
      })
      .on(/UPDATE game_equipment/, { rows: [] })
      .on(/UPDATE game_items/, { rows: [] });
    return attachTx(fake);
  }

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = attachTx(new FakeDatabase());
    const res = await makeService({ fake, character: null }).svc.unequip(7, 11);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  test('物品不存在 / 归属他人 -> 对应错误', async () => {
    const f1 = attachTx(new FakeDatabase().on(/FROM game_items i/, { rows: [] }));
    assert.equal(codeOf(await makeService({ fake: f1 }).svc.unequip(7, 11)), 'ITEM_NOT_FOUND');
    const f2 = attachTx(
      new FakeDatabase().on(/FROM game_items i/, { rows: [itemRow({ character_id: 99 })] }),
    );
    assert.equal(codeOf(await makeService({ fake: f2 }).svc.unequip(7, 11)), 'ITEM_NOT_OWNED');
  });

  test('装备栏无记录 -> ITEM_NOT_EQUIPPED', async () => {
    const fake = unequipFake({}, { equipRowMissing: true });
    const res = await makeService({ fake }).svc.unequip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_EQUIPPED');
  });

  test('slots 非法 JSON -> 按空栏处理 -> ITEM_NOT_EQUIPPED', async () => {
    const fake = unequipFake({}, { slots: '{bad' });
    const res = await makeService({ fake }).svc.unequip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_EQUIPPED');
  });

  test('物品未被装备（槽位无该 id）-> ITEM_NOT_EQUIPPED', async () => {
    const fake = unequipFake({ id: 11 }, { slots: JSON.stringify({ weapon: 42 }) });
    const res = await makeService({ fake }).svc.unequip(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_EQUIPPED');
  });

  test('成功卸下 -> 槽位置 null + 状态回 bag', async () => {
    const fake = unequipFake({ id: 11 }, { slots: JSON.stringify({ weapon: 11, ring1: null }) });
    const res = await makeService({ fake }).svc.unequip(7, 11);
    assert.equal(res.success, true);
    const slots = JSON.parse(String(fake.lastCall(/UPDATE game_equipment/)?.params[0]));
    assert.equal(slots.weapon, null);
    assert.match(fake.lastCall(/UPDATE game_items/)?.sql ?? '', /status = 'bag'/);
  });
});

describe('ItemService.discard 边界', () => {
  function discardFake(itemOver: Record<string, unknown>): FakeDatabase {
    return attachTx(
      new FakeDatabase()
        .on(/FROM game_items i/, { rows: [itemRow(itemOver)] })
        .on(/DELETE FROM game_items/, { rows: [] }),
    );
  }

  test('无角色 / 不存在 / 非本人 -> 对应错误', async () => {
    const f0 = attachTx(new FakeDatabase());
    assert.equal(
      codeOf(await makeService({ fake: f0, character: null }).svc.discard(7, 11)),
      'CHARACTER_NOT_FOUND',
    );
    const f1 = attachTx(new FakeDatabase().on(/FROM game_items i/, { rows: [] }));
    assert.equal(codeOf(await makeService({ fake: f1 }).svc.discard(7, 11)), 'ITEM_NOT_FOUND');
    const f2 = attachTx(
      new FakeDatabase().on(/FROM game_items i/, { rows: [itemRow({ character_id: 99 })] }),
    );
    assert.equal(codeOf(await makeService({ fake: f2 }).svc.discard(7, 11)), 'ITEM_NOT_OWNED');
  });

  test('status=equipped -> ITEM_NOT_IN_BAG（需先卸下）', async () => {
    const fake = discardFake({ status: 'equipped' });
    const res = await makeService({ fake }).svc.discard(7, 11);
    assert.equal(codeOf(res), 'ITEM_NOT_IN_BAG');
    assert.match(res.message, /已装备/);
    assert.equal(fake.callsMatching(/DELETE FROM game_items/).length, 0);
  });

  test('成功丢弃 -> 物理 DELETE', async () => {
    const fake = discardFake({ status: 'bag' });
    const res = await makeService({ fake }).svc.discard(7, 11);
    assert.equal(res.success, true);
    assert.deepEqual(fake.lastCall(/DELETE FROM game_items/)?.params, [11]);
  });
});

describe('ItemService.equipment 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.equipment(7);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  test('无装备栏记录 -> 全空槽，equippedCount=0', async () => {
    const fake = new FakeDatabase().on(/FROM game_equipment/, { rows: [] });
    const res = await makeService({ fake }).svc.equipment(7);
    const d = payload<{ slots: Record<string, unknown>; equippedCount: number }>(res);
    assert.equal(d.equippedCount, 0);
    assert.equal(d.slots.weapon, null);
    // 无物品 id 时不查询物品
    assert.equal(fake.callsMatching(/ANY\(\$1::bigint\[\]\)/).length, 0);
  });

  test('slots 非法 JSON -> 全空槽', async () => {
    const fake = new FakeDatabase().on(/FROM game_equipment/, { rows: [{ slots: '{bad' }] });
    const res = await makeService({ fake }).svc.equipment(7);
    assert.equal(payload<{ equippedCount: number }>(res).equippedCount, 0);
  });

  test('已装备物品 -> 视图填充并计数；DB 缺失的行被跳过', async () => {
    const slots = JSON.stringify({ weapon: 11, body: 12 });
    const fake = new FakeDatabase()
      .on(/FROM game_equipment/, { rows: [{ slots }] })
      .on(/ANY\(\$1::bigint\[\]\)/, {
        rows: [
          { id: 11, base_name: '铁剑', rarity: 2, tier: 3 },
          // body=12 在库中缺失 -> 应被跳过
        ],
      });
    const res = await makeService({ fake }).svc.equipment(7);
    const d = payload<{ slots: Record<string, { id: number } | null>; equippedCount: number }>(res);
    assert.equal(d.equippedCount, 1);
    assert.equal(d.slots.weapon?.id, 11);
    assert.equal(d.slots.body, null);
  });
});

describe('ItemService.bases 边界', () => {
  const baseRow = {
    id: 2,
    code: 'sword',
    name: '铁剑',
    category: 'weapon',
    slot: 'weapon',
    sub_type: null,
    tier: 1,
    base_stats: '{"atk":5}',
    rarity_limit: 3,
    drop_weight: 100,
  };

  test('空表 -> total=0、bases=[]', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [] })
      .on(/ORDER BY tier, id/, { rows: [] });
    const res = await makeService({ fake }).svc.bases({});
    assert.equal(payload<{ total: number; bases: unknown[] }>(res).total, 0);
    assert.deepEqual(payload<{ bases: unknown[] }>(res).bases, []);
  });

  test('缺省过滤 -> 无 WHERE，参数为 LIMIT/OFFSET', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/ORDER BY tier, id/, { rows: [] });
    await makeService({ fake }).svc.bases({});
    const count = fake.lastCall(/COUNT\(\*\)/);
    assert.doesNotMatch(count?.sql ?? '', /WHERE/);
    assert.deepEqual(fake.lastCall(/ORDER BY tier, id/)?.params, [20, 0]);
  });

  test('category/tier 过滤 + 分页 clamp', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/ORDER BY tier, id/, { rows: [] });
    await makeService({ fake }).svc.bases({ category: 'weapon', tier: 0, page: 0, pageSize: 1000 });
    const list = fake.lastCall(/ORDER BY tier, id/);
    assert.deepEqual(list?.params, ['weapon', 0, 100, 0]);
    assert.match(list?.sql ?? '', /tier = \$2/);
  });

  test('base_stats 非法 JSON -> null；合法 -> 对象', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '2' }] })
      .on(/ORDER BY tier, id/, {
        rows: [baseRow, { ...baseRow, id: 3, base_stats: '{bad' }],
      });
    const res = await makeService({ fake }).svc.bases({});
    const bases = payload<{ bases: Array<{ baseStats: unknown }> }>(res).bases;
    assert.deepEqual(bases[0].baseStats, { atk: 5 });
    assert.equal(bases[1].baseStats, null);
  });

  test('withPool=1 -> 汇总前缀/后缀 code；withPool 非 1 不查池', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '1' }] })
      .on(/ORDER BY tier, id/, { rows: [baseRow] })
      .on(/FROM game_base_affix_pools/, {
        rows: [
          { polarity: 'prefix', code: 'atk_1', tier: 1 },
          { polarity: 'suffix', code: 'def_1', tier: 1 },
          { polarity: 'prefix', code: 'atk_2', tier: 2 },
        ],
      });
    const res = await makeService({ fake }).svc.bases({ withPool: 1 });
    const summary = payload<{ bases: Array<{ affixPoolSummary: { prefix: string[]; suffix: string[] } }> }>(
      res,
    ).bases[0].affixPoolSummary;
    assert.deepEqual(summary.prefix, ['atk_1', 'atk_2']);
    assert.deepEqual(summary.suffix, ['def_1']);

    const fake2 = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '1' }] })
      .on(/ORDER BY tier, id/, { rows: [baseRow] });
    await makeService({ fake: fake2 }).svc.bases({ withPool: 0 });
    assert.equal(fake2.callsMatching(/FROM game_base_affix_pools/).length, 0);
  });
});

describe('ItemService.generateItemForUser 门禁', () => {
  async function withProduction<T>(fn: () => Promise<T>): Promise<T> {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  }

  test('NODE_ENV=production -> FORBIDDEN，且不解析角色/不限流', async () => {
    await withProduction(async () => {
      const fake = new FakeDatabase();
      const { svc, rate, character } = makeService({ fake });
      const res = await svc.generateItemForUser(7, 1, 0, null);
      assert.equal(codeOf(res), 'FORBIDDEN');
      assert.equal(character.callCount, 0);
      assert.equal(rate.callCount, 0);
    });
  });

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.generateItemForUser(7, 1, 0, null);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  test('characterId 非本人 -> FORBIDDEN，且归属校验先于限流（不消耗额度）', async () => {
    const fake = new FakeDatabase();
    const { svc, rate } = makeService({ fake, allow: false });
    const res = await svc.generateItemForUser(7, 1, 0, 999);
    assert.equal(codeOf(res), 'FORBIDDEN');
    assert.match(res.message, /本人角色/);
    assert.equal(rate.callCount, 0);
  });

  test('限流拒绝 -> RATE_LIMITED，额度取 APP_CONFIG.devToolRateLimitPerMinute', async () => {
    const fake = new FakeDatabase();
    const { svc, rate } = makeService({ fake, allow: false });
    const res = await svc.generateItemForUser(7, 1, 0, null);
    assert.equal(codeOf(res), 'RATE_LIMITED');
    assert.equal(rate.last?.[0], 7);
    assert.equal(rate.last?.[1], APP_CONFIG.devToolRateLimitPerMinute);
  });

  test('characterId=null -> 生成无主物品（characterId 透传 null）', async () => {
    const fake = new FakeDatabase();
    const { svc, affix } = makeService({ fake });
    await svc.generateItemForUser(7, 3, 2, null);
    assert.deepEqual(affix.generateItem.last, [3, 2, null]);
  });

  test('characterId=本人 -> 归属本人 id', async () => {
    const fake = new FakeDatabase();
    const { svc, affix } = makeService({ fake });
    await svc.generateItemForUser(7, 3, 2, 5);
    assert.deepEqual(affix.generateItem.last, [3, 2, 5]);
  });

  test('baseId/rarity 非法在当前层不校验，原样交给 affixService（下一层覆盖）', async () => {
    const fake = new FakeDatabase();
    const { svc, affix } = makeService({ fake });
    await svc.generateItemForUser(7, -1, 99, null);
    assert.deepEqual(affix.generateItem.last, [-1, 99, null]);
  });
});

describe('ItemService 拾取规则 边界', () => {
  const ruleRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 1,
    character_id: 5,
    name: '规则A',
    rarity_min: 0,
    tier_min: 1,
    affix_codes: '[]',
    action: 'keep',
    enabled: true,
    priority: 100,
    created_at: 'a',
    updated_at: 'b',
    ...over,
  });

  function listFake(rows: Record<string, unknown>[]): FakeDatabase {
    return new FakeDatabase().on(/FROM game_pickup_rules/, { rows });
  }

  test('listPickupRules：无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.listPickupRules(7);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  test('listPickupRules：空表 -> rules=[]；非法 affix_codes -> []', async () => {
    const empty = await makeService({ fake: listFake([]) }).svc.listPickupRules(7);
    assert.deepEqual(payload<{ rules: unknown[] }>(empty).rules, []);
    const bad = await makeService({ fake: listFake([ruleRow({ affix_codes: '{bad' })]) }).svc.listPickupRules(7);
    assert.deepEqual(payload<{ rules: Array<{ affixCodes: unknown }> }>(bad).rules[0].affixCodes, []);
  });

  test('createPickupRule：名称空串/纯空白/非字符串 -> INVALID_RULE 且不 INSERT', async () => {
    const cases: unknown[] = ['', '   ', 123, null, undefined];
    for (const name of cases) {
      const fake = new FakeDatabase();
      const res = await makeService({ fake }).svc.createPickupRule(7, { name });
      assert.equal(codeOf(res), 'INVALID_RULE', 'name=' + String(name));
      assert.equal(fake.callsMatching(/INSERT INTO game_pickup_rules/).length, 0);
    }
  });

  test('createPickupRule：名称去首尾空白后落库', async () => {
    const fake = new FakeDatabase().on(/INSERT INTO game_pickup_rules/, { rows: [ruleRow()] });
    await makeService({ fake }).svc.createPickupRule(7, { name: '  规则A  ' });
    assert.equal(fake.lastCall(/INSERT INTO game_pickup_rules/)?.params[1], '规则A');
  });

  const rarityCases: Array<[unknown, number]> = [
    [-1, 0],
    [0, 0],
    [3, 3],
    [4, 3],
    [2.9, 2],
    [-0.5, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    ['2', 0],
    [undefined, 0],
  ];
  for (const [input, expected] of rarityCases) {
    test('createPickupRule：rarityMin=' + JSON.stringify(input) + ' -> ' + expected + '（0~3 clamp）', async () => {
      const fake = new FakeDatabase().on(/INSERT INTO game_pickup_rules/, { rows: [ruleRow()] });
      await makeService({ fake }).svc.createPickupRule(7, { name: '规则', rarityMin: input });
      assert.equal(fake.lastCall(/INSERT INTO game_pickup_rules/)?.params[2], expected);
    });
  }

  const tierCases: Array<[unknown, number]> = [
    [0, 1],
    [1, 1],
    [14, 14],
    [15, 14],
    [13.9, 13],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    ['7', 1],
    [undefined, 1],
  ];
  for (const [input, expected] of tierCases) {
    test('createPickupRule：tierMin=' + JSON.stringify(input) + ' -> ' + expected + '（1~14 clamp）', async () => {
      const fake = new FakeDatabase().on(/INSERT INTO game_pickup_rules/, { rows: [ruleRow()] });
      await makeService({ fake }).svc.createPickupRule(7, { name: '规则', tierMin: input });
      assert.equal(fake.lastCall(/INSERT INTO game_pickup_rules/)?.params[3], expected);
    });
  }

  const priorityCases: Array<[unknown, number]> = [
    [-1, 0],
    [0, 0],
    [1000, 1000],
    [1001, 1000],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    ['x', 100],
    [undefined, 100],
  ];
  for (const [input, expected] of priorityCases) {
    test('createPickupRule：priority=' + JSON.stringify(input) + ' -> ' + expected + '（0~1000 clamp，缺省 100）', async () => {
      const fake = new FakeDatabase().on(/INSERT INTO game_pickup_rules/, { rows: [ruleRow()] });
      await makeService({ fake }).svc.createPickupRule(7, { name: '规则', priority: input });
      assert.equal(fake.lastCall(/INSERT INTO game_pickup_rules/)?.params[7], expected);
    });
  }

  test('createPickupRule：action 白名单外回退 keep，enabled 缺省 true / false 生效', async () => {
    const f1 = new FakeDatabase().on(/INSERT INTO game_pickup_rules/, { rows: [ruleRow()] });
    await makeService({ fake: f1 }).svc.createPickupRule(7, { name: '规则', action: 'explode' });
    assert.equal(f1.lastCall(/INSERT INTO game_pickup_rules/)?.params[5], 'keep');
    assert.equal(f1.lastCall(/INSERT INTO game_pickup_rules/)?.params[6], true);

    const f2 = new FakeDatabase().on(/INSERT INTO game_pickup_rules/, { rows: [ruleRow()] });
    await makeService({ fake: f2 }).svc.createPickupRule(7, { name: '规则', action: 'salvage', enabled: false });
    assert.equal(f2.lastCall(/INSERT INTO game_pickup_rules/)?.params[5], 'salvage');
    assert.equal(f2.lastCall(/INSERT INTO game_pickup_rules/)?.params[6], false);
  });

  test('createPickupRule：affixCodes 非数组 -> []；超 50 截断；非字符串过滤', async () => {
    const fake = new FakeDatabase().on(/INSERT INTO game_pickup_rules/, { rows: [ruleRow()] });
    await makeService({ fake }).svc.createPickupRule(7, { name: '规则', affixCodes: 'not-array' });
    assert.equal(fake.lastCall(/INSERT INTO game_pickup_rules/)?.params[4], '[]');

    const codes = Array.from({ length: 55 }, (_, i) => 'c' + i);
    await makeService({ fake }).svc.createPickupRule(7, { name: '规则', affixCodes: [...codes, 42] });
    const stored = JSON.parse(String(fake.lastCall(/INSERT INTO game_pickup_rules/)?.params[4]));
    assert.equal(stored.length, 50);
    assert.equal(fake.callsMatching(/INSERT INTO game_pickup_rules/).length, 2);
  });

  test('updatePickupRule：规则不存在 / 非本人 -> PICKUP_RULE_NOT_FOUND', async () => {
    const f1 = new FakeDatabase().on(/SELECT \* FROM game_pickup_rules/, { rows: [] });
    assert.equal(codeOf(await makeService({ fake: f1 }).svc.updatePickupRule(7, 1, {})), 'PICKUP_RULE_NOT_FOUND');
    const f2 = new FakeDatabase().on(/SELECT \* FROM game_pickup_rules/, { rows: [ruleRow({ character_id: 99 })] });
    assert.equal(codeOf(await makeService({ fake: f2 }).svc.updatePickupRule(7, 1, {})), 'PICKUP_RULE_NOT_FOUND');
  });

  test('updatePickupRule：空名称沿用旧值；NaN 数值沿用旧值（fallback=prev）', async () => {
    const fake = new FakeDatabase()
      .on(/SELECT \* FROM game_pickup_rules/, {
        rows: [ruleRow({ name: '旧名', rarity_min: 2, tier_min: 3, priority: 500 })],
      })
      .on(/UPDATE game_pickup_rules/, { rows: [ruleRow()] });
    await makeService({ fake }).svc.updatePickupRule(7, 1, {
      name: '   ',
      rarityMin: Number.NaN,
      tierMin: undefined,
      priority: Number.NaN,
    });
    const p = fake.lastCall(/UPDATE game_pickup_rules/)?.params;
    assert.equal(p?.[0], '旧名');
    assert.equal(p?.[1], 2);
    assert.equal(p?.[2], 3);
    assert.equal(p?.[6], 500);
  });

  test('updatePickupRule：partial 语义（affixCodes/action/enabled 缺省沿用旧值；enabled=0 视为 true）', async () => {
    const fake = new FakeDatabase()
      .on(/SELECT \* FROM game_pickup_rules/, {
        rows: [ruleRow({ affix_codes: '["a"]', action: 'sell', enabled: false, priority: 9 })],
      })
      .on(/UPDATE game_pickup_rules/, { rows: [ruleRow()] });
    await makeService({ fake }).svc.updatePickupRule(7, 1, { enabled: 0 });
    const p = fake.lastCall(/UPDATE game_pickup_rules/)?.params;
    assert.equal(p?.[3], '["a"]');
    assert.equal(p?.[4], 'sell');
    // enabled=0 不是 false，按「未显式关闭」处理 -> true（实测行为）
    assert.equal(p?.[5], true);
    assert.equal(p?.[6], 9);
  });

  test('updatePickupRule：prev.affix_codes 非法 JSON -> []', async () => {
    const fake = new FakeDatabase()
      .on(/SELECT \* FROM game_pickup_rules/, { rows: [ruleRow({ affix_codes: '{bad' })] })
      .on(/UPDATE game_pickup_rules/, { rows: [ruleRow()] });
    await makeService({ fake }).svc.updatePickupRule(7, 1, {});
    assert.equal(fake.lastCall(/UPDATE game_pickup_rules/)?.params[3], '[]');
  });

  test('deletePickupRule：不存在 / 非本人 -> PICKUP_RULE_NOT_FOUND 且不 DELETE', async () => {
    const f1 = new FakeDatabase().on(/SELECT id, character_id FROM game_pickup_rules/, { rows: [] });
    assert.equal(codeOf(await makeService({ fake: f1 }).svc.deletePickupRule(7, 1)), 'PICKUP_RULE_NOT_FOUND');
    assert.equal(f1.callsMatching(/DELETE FROM game_pickup_rules/).length, 0);

    const f2 = new FakeDatabase().on(/SELECT id, character_id FROM game_pickup_rules/, {
      rows: [{ id: 1, character_id: 99 }],
    });
    assert.equal(codeOf(await makeService({ fake: f2 }).svc.deletePickupRule(7, 1)), 'PICKUP_RULE_NOT_FOUND');
    assert.equal(f2.callsMatching(/DELETE FROM game_pickup_rules/).length, 0);
  });

  test('deletePickupRule：成功 -> DELETE 携带 ruleId', async () => {
    const fake = new FakeDatabase()
      .on(/SELECT id, character_id FROM game_pickup_rules/, { rows: [{ id: 8, character_id: 5 }] })
      .on(/DELETE FROM game_pickup_rules/, { rows: [] });
    const res = await makeService({ fake }).svc.deletePickupRule(7, 8);
    assert.equal(res.success, true);
    assert.deepEqual(fake.lastCall(/DELETE FROM game_pickup_rules/)?.params, [8]);
  });
});
