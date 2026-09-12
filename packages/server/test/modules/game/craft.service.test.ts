/**
 * CraftService 边界测试：十四种炼器操作的品阶/状态/词缀校验、消耗与成功回写。
 *
 * 手动 new（gameDb=FakeDatabase+withTransaction，affix/stat/character 用 stub）。
 * 随机分支通过临时覆写 Math.random 固定（finally 还原）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CraftService } from '../../../src/modules/logic/economy/internal/craft.service.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';

type Result = { success: boolean; message: string; data?: unknown };
const payload = <T>(res: Result): T => res.data as T;
const codeOf = (res: Result): string => (res.data as { code?: string } | undefined)?.code ?? '';

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

function craftItem(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11',
    character_id: 5,
    base_id: 2,
    rarity: 0,
    tier: 1,
    quality: 0,
    affixes: '[]',
    base_stats: null,
    mirrored: false,
    vaaled: false,
    status: 'bag',
    created_at: '2025-01-01',
    code: 'sword',
    name: '铁剑',
    category: 'weapon',
    slot: 'weapon',
    base_base_stats: '{"atk":5}',
    ...over,
  };
}

interface FakeOpts {
  item?: Record<string, unknown> | null;
  affixIdRows?: Record<string, unknown>[];
  basePolarityRows?: Record<string, unknown>[];
  wispRows?: Record<string, unknown>[];
  essenceRows?: Record<string, unknown>[];
  walletRows?: Record<string, unknown>[];
  essenceInvRows?: Record<string, unknown>[];
  vaalRows?: Record<string, unknown>[];
}

function makeFake(o: FakeOpts = {}): FakeDatabase {
  const itemRows = o.item === null ? [] : [o.item ?? craftItem()];
  const fake = new FakeDatabase()
    .on(/FROM game_items i JOIN game_item_bases b/, { rows: itemRows })
    .on(/FROM game_affixes WHERE id = ANY/, { rows: o.affixIdRows ?? [] })
    .on(/FROM game_affixes WHERE code = 'vaal_demonic'/, { rows: o.vaalRows ?? [{ id: 77 }] })
    .on(/FROM game_affixes WHERE polarity = 'base'/, { rows: o.basePolarityRows ?? [] })
    .on(/FROM game_affixes WHERE code = \$1 AND polarity = 'base'/, { rows: o.wispRows ?? [] })
    .on(/FROM game_essences WHERE code/, { rows: o.essenceRows ?? [] })
    .on(/UPDATE game_wallets/, { rows: o.walletRows ?? [{ amount: '1' }] })
    .on(/UPDATE game_essence_inventory/, { rows: o.essenceInvRows ?? [{ count: '0' }] })
    .on(/UPDATE game_items SET base_stats/, { rows: [] })
    .on(/UPDATE game_items SET rarity/, { rows: [] })
    .on(/DELETE FROM game_items/, { rows: [] })
    .on(/INSERT INTO game_items/, { rows: [{ id: '99' }] });
  return attachTx(fake);
}

function makeService(opts: {
  fake: FakeDatabase;
  character?: Character | null;
  affix?: Record<string, ReturnType<typeof stub>>;
}) {
  const character = opts.character === undefined ? CHAR : opts.character;
  const characterStub = stub(() => character);
  const affix: Record<string, ReturnType<typeof stub>> = {
    findAffixesByIds: stub((..._a: unknown[]) => []),
    allocCountsFor: stub((total: number, maxP: number, maxS: number) => ({
      prefixCount: Math.min(maxP, total),
      suffixCount: Math.min(maxS, total - Math.min(maxP, total)),
    })),
    rollRollableEntries: stub((..._a: unknown[]) => []),
    rerollEntryValues: stub((entries: unknown[]) => entries),
    queryRollPoolFor: stub((..._a: unknown[]) => []),
    rollOneFromRows: stub((rows: unknown[]) =>
      rows.length ? { affixId: 1, value: 1, polarity: 'prefix', key: 'atk' } : null,
    ),
    samplePoolRows: stub((..._a: unknown[]) => []),
    rollRow: stub((..._a: unknown[]) => ({ affixId: 1, value: 1, polarity: 'prefix', key: 'atk' })),
    renderItem: stub((..._a: unknown[]) => ({ id: 1 })),
  };
  Object.assign(affix, opts.affix ?? {});
  const stat = stub((..._a: unknown[]) => undefined);
  const svc = new CraftService(
    opts.fake as never,
    { findByUserId: characterStub } as never,
    affix as never,
    { increment: stat } as never,
  );
  return { svc, affix, stat, character: characterStub };
}

async function withRandom<T>(value: number, fn: () => Promise<T>): Promise<T> {
  const prev = Math.random;
  Math.random = () => value;
  try {
    return await fn();
  } finally {
    Math.random = prev;
  }
}

const rolled = (id: number, polarity: 'prefix' | 'suffix', value = 5): Record<string, unknown> => ({
  affixId: id,
  value,
  polarity,
  key: 'atk',
});
const rolledAffixes = (n: number): string => JSON.stringify(Array.from({ length: n }, (_, i) => rolled(i + 1, i % 2 ? 'suffix' : 'prefix')));

describe('CraftService 前置边界', () => {
  test('未知 op -> INVALID_OP，且不解析角色/不开事务', async () => {
    const fake = makeFake();
    const { svc, character } = makeService({ fake });
    const res = await svc.craft(7, 11, 'bogus');
    assert.equal(codeOf(res), 'INVALID_OP');
    assert.equal(character.callCount, 0);
    assert.equal(fake.callCount, 0);
  });

  test('op 为空串/大小写不符 -> INVALID_OP', async () => {
    const fake = makeFake();
    const { svc } = makeService({ fake });
    assert.equal(codeOf(await svc.craft(7, 11, '')), 'INVALID_OP');
    assert.equal(codeOf(await svc.craft(7, 11, 'TRANSMUTE')), 'INVALID_OP');
  });

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = makeFake();
    const res = await makeService({ fake, character: null }).svc.craft(7, 11, 'transmute');
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  test('物品不存在（含基底缺失时 JOIN 无行）-> ITEM_NOT_FOUND', async () => {
    const fake = makeFake({ item: null });
    const res = await makeService({ fake }).svc.craft(7, 11, 'transmute');
    assert.equal(codeOf(res), 'ITEM_NOT_FOUND');
  });

  test('物品归属他人 -> ITEM_NOT_OWNED', async () => {
    const fake = makeFake({ item: craftItem({ character_id: 99 }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'transmute');
    assert.equal(codeOf(res), 'ITEM_NOT_OWNED');
  });

  test('非背包状态 -> ITEM_NOT_IN_BAG', async () => {
    const fake = makeFake({ item: craftItem({ status: 'equipped' }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'transmute');
    assert.equal(codeOf(res), 'ITEM_NOT_IN_BAG');
  });

  test('rarity=3 传奇 -> LEGENDARY_IMMUTABLE（先于各 op 校验）', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 3 }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'blessed');
    assert.equal(codeOf(res), 'LEGENDARY_IMMUTABLE');
  });

  test('vaaled=true -> VAALED_IMMUTABLE', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 2, vaaled: true }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'chaos');
    assert.equal(codeOf(res), 'VAALED_IMMUTABLE');
  });

  test('事务内查询抛错 -> Promise reject', async () => {
    const fake = attachTx(
      new FakeDatabase().on(/FROM game_items i JOIN game_item_bases b/, () => {
        throw new Error('craft tx boom');
      }),
    );
    await assert.rejects(() => makeService({ fake }).svc.craft(7, 11, 'transmute'), /craft tx boom/);
  });
});

describe('CraftService 各操作品阶校验', () => {
  const mismatches: Array<[string, number]> = [
    ['transmute', 1],
    ['alchemy', 1],
    ['chaos', 0],
    ['exalt', 0],
    ['scour', 0],
    ['divine', 0],
    ['essence', 0],
  ];
  for (const [op, rarity] of mismatches) {
    test(op + ' rarity=' + rarity + ' -> RARITY_MISMATCH', async () => {
      const fake = makeFake({ item: craftItem({ rarity }) });
      const res = await makeService({ fake }).svc.craft(7, 11, op);
      assert.equal(codeOf(res), 'RARITY_MISMATCH');
    });
  }

  test('annul 无可剥离词缀 -> NO_AFFIX_TO_REMOVE', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1, affixes: '[]' }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'annul');
    assert.equal(codeOf(res), 'NO_AFFIX_TO_REMOVE');
  });

  test('divine 无可重 roll 词缀 -> AFFIX_LIMIT', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1, affixes: '[]' }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'divine');
    assert.equal(codeOf(res), 'AFFIX_LIMIT');
  });

  test('mirror 已镜像 -> MIRROR_IMMUTABLE', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 2, mirrored: true }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'mirror');
    assert.equal(codeOf(res), 'MIRROR_IMMUTABLE');
  });

  test('fracture rarity!=2 -> FRACTURE_REQUIREMENT', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1, affixes: rolledAffixes(4) }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'fracture');
    assert.equal(codeOf(res), 'FRACTURE_REQUIREMENT');
  });

  test('fracture 宝品但词缀<4 -> FRACTURE_REQUIREMENT', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 2, affixes: rolledAffixes(3) }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'fracture');
    assert.equal(codeOf(res), 'FRACTURE_REQUIREMENT');
  });

  test('exalt 宝品 6 条词缀 -> MAX_AFFIXES（稀有度上界）', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 2, affixes: rolledAffixes(6) }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'exalt');
    assert.equal(codeOf(res), 'MAX_AFFIXES');
  });

  test('ember 无新基底词缀可选 -> AFFIX_LIMIT', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 2 }), basePolarityRows: [] });
    const res = await makeService({ fake }).svc.craft(7, 11, 'ember');
    assert.equal(codeOf(res), 'AFFIX_LIMIT');
  });
});

describe('CraftService extraCode 缺省与目标校验', () => {
  test('wisp 缺 extraCode -> INVALID_PARAM', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1 }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'wisp');
    assert.equal(codeOf(res), 'INVALID_PARAM');
  });

  test('wisp 基底词缀不存在 -> AFFIX_NOT_FOUND', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1 }), wispRows: [] });
    const res = await makeService({ fake }).svc.craft(7, 11, 'wisp', 'nope');
    assert.equal(codeOf(res), 'AFFIX_NOT_FOUND');
  });

  test('essence 缺 extraCode -> INVALID_PARAM', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1 }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'essence');
    assert.equal(codeOf(res), 'INVALID_PARAM');
  });

  test('essence 精华不存在 -> ESSENCE_NOT_FOUND', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1 }), essenceRows: [] });
    const res = await makeService({ fake }).svc.craft(7, 11, 'essence', 'nope');
    assert.equal(codeOf(res), 'ESSENCE_NOT_FOUND');
  });

  test('essence 底材无对应族词缀 -> NOT_AVAILABLE', async () => {
    const fake = makeFake({
      item: craftItem({ rarity: 1 }),
      essenceRows: [{ id: 1, polarity: 'prefix', target_family: 'atk', name: '攻击精华' }],
    });
    const { svc } = makeService({ fake, affix: { queryRollPoolFor: stub(() => []) } });
    const res = await svc.craft(7, 11, 'essence', 'e_atk');
    assert.equal(codeOf(res), 'NOT_AVAILABLE');
  });

  test('普通 op 传了 extraCode 也不受影响（transmute）', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 0 }) });
    const res = await makeService({ fake }).svc.craft(7, 11, 'transmute', 'ignored');
    assert.equal(res.success, true);
  });
});

describe('CraftService 消耗校验', () => {
  test('通货不足（UPDATE 无行）-> NOT_ENOUGH_CURRENCY', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 0 }), walletRows: [] });
    const res = await makeService({ fake }).svc.craft(7, 11, 'transmute');
    assert.equal(codeOf(res), 'NOT_ENOUGH_CURRENCY');
  });

  test('精华不足（UPDATE 无行）-> NOT_ENOUGH_ESSENCE', async () => {
    const fake = makeFake({
      item: craftItem({ rarity: 1 }),
      essenceRows: [{ id: 3, polarity: 'prefix', target_family: 'atk', name: '攻击精华' }],
      essenceInvRows: [],
    });
    const { svc } = makeService({
      fake,
      affix: {
        queryRollPoolFor: stub(() => [{ id: 1, code: 'atk_1', polarity: 'prefix', tier: 1, weight: 1 }]),
      },
    });
    const res = await svc.craft(7, 11, 'essence', 'e_atk');
    assert.equal(codeOf(res), 'NOT_ENOUGH_ESSENCE');
  });
});

describe('CraftService 成功路径', () => {
  test('transmute 凡品 -> 灵品；扣通货；记录 craft_total', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 0 }) });
    const { svc, stat } = makeService({ fake });
    const res = await svc.craft(7, 11, 'transmute');
    assert.equal(res.success, true);
    const upd = fake.lastCall(/UPDATE game_items SET rarity/);
    assert.equal(upd?.params?.[0], 1);
    assert.equal(upd?.params?.[2], '11');
    assert.match(fake.lastCall(/UPDATE game_wallets/)?.sql ?? '', /amount >= 1/);
    assert.deepEqual(stat.last, [5, 'craft_total', 1]);
  });

  test('chaos 灵品 -> 成功，稀有度保持', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 1, affixes: rolledAffixes(2) }) });
    const { svc } = makeService({ fake });
    const res = await svc.craft(7, 11, 'chaos');
    assert.equal(res.success, true);
    assert.equal(fake.lastCall(/UPDATE game_items SET rarity/)?.params?.[0], 1);
  });

  test('wisp 成功 -> 基底条目替换并回传 baseAffix', async () => {
    const fake = makeFake({
      item: craftItem({ rarity: 1 }),
      wispRows: [{ id: 6 }],
    });
    const { svc } = makeService({ fake });
    const res = await svc.craft(7, 11, 'wisp', 'e_base');
    assert.equal(res.success, true);
    assert.equal(payload<{ baseAffix: string }>(res).baseAffix, 'e_base');
  });

  test('ember 成功 -> 选择新基底词缀', async () => {
    const fake = makeFake({
      item: craftItem({ rarity: 2 }),
      basePolarityRows: [{ id: 5 }, { id: 6 }],
    });
    const { svc, affix } = makeService({ fake });
    const res = await svc.craft(7, 11, 'ember');
    assert.equal(res.success, true);
    const finalEntries = affix.renderItem.last?.[10] as Array<{ affixId: number; polarity: string }>;
    assert.equal(finalEntries.length, 1);
    assert.equal(finalEntries[0].polarity, 'base');
    assert.ok([5, 6].includes(finalEntries[0].affixId));
  });

  test('essence 成功 -> 定向族条目 + essence 元数据；扣精华', async () => {
    const fake = makeFake({
      item: craftItem({ rarity: 1 }),
      essenceRows: [{ id: 3, polarity: 'prefix', target_family: 'atk', name: '攻击精华' }],
      essenceInvRows: [{ count: '0' }],
    });
    const affix = {
      queryRollPoolFor: stub((...args: unknown[]) => {
        const polarity = args[1];
        return polarity === 'prefix'
          ? [{ id: 1, code: 'atk_1', polarity: 'prefix', tier: 1, weight: 1 }]
          : [];
      }),
      allocCountsFor: stub(() => ({ prefixCount: 1, suffixCount: 0 })),
    };
    const { svc } = makeService({ fake, affix });
    const res = await svc.craft(7, 11, 'essence', 'e_atk');
    assert.equal(res.success, true);
    assert.equal(payload<{ essence: string }>(res).essence, 'e_atk');
    assert.match(fake.lastCall(/UPDATE game_essence_inventory/)?.sql ?? '', /count >= 1/);
  });

  test('mirror 成功 -> INSERT 复制一份（mirrored=TRUE）', async () => {
    const fake = makeFake({ item: craftItem({ rarity: 2, mirrored: false }) });
    const { svc } = makeService({ fake });
    const res = await svc.craft(7, 11, 'mirror');
    assert.equal(res.success, true);
    const ins = fake.lastCall(/INSERT INTO game_items/);
    assert.equal(ins?.params?.[0], 5);
    assert.match(ins?.sql ?? '', /mirrored/);
    assert.match(ins?.sql ?? '', /TRUE, FALSE, 'bag'/);
  });
});

describe('CraftService vaal 随机结果', () => {
  const vaalItem = craftItem({
    rarity: 1,
    affixes: JSON.stringify([{ affixId: 1, value: 10, polarity: 'prefix', key: 'atk' }]),
  });

  test('Math.random<0.6 -> empowered，数值 ×1.5', async () => {
    const fake = makeFake({ item: vaalItem });
    const { svc, affix } = makeService({ fake });
    await withRandom(0.1, async () => {
      const res = await svc.craft(7, 11, 'vaal');
      assert.equal(res.success, true);
      assert.equal(payload<{ outcome: string }>(res).outcome, 'empowered');
      const entries = affix.renderItem.last?.[10] as Array<{ affixId: number; value: number }>;
      assert.equal(entries[0].value, 15);
    });
  });

  test('0.6<=Math.random<0.9 -> demonic，追加 vaal_demonic 固定词缀', async () => {
    const fake = makeFake({ item: vaalItem, vaalRows: [{ id: 77 }] });
    const { svc, affix } = makeService({ fake });
    await withRandom(0.7, async () => {
      const res = await svc.craft(7, 11, 'vaal');
      assert.equal(res.success, true);
      assert.equal(payload<{ outcome: string }>(res).outcome, 'demonic');
      const entries = affix.renderItem.last?.[10] as Array<{ affixId: number }>;
      assert.ok(entries.some((e) => e.affixId === 77));
    });
  });

  test('Math.random>=0.9 -> destroyed，物品 DELETE 且不 UPDATE', async () => {
    const fake = makeFake({ item: vaalItem });
    const { svc } = makeService({ fake });
    await withRandom(0.95, async () => {
      const res = await svc.craft(7, 11, 'vaal');
      assert.equal(res.success, true);
      assert.equal(payload<{ destroyed: boolean }>(res).destroyed, true);
      assert.match(res.message, /摧毁/);
      assert.equal(fake.callsMatching(/DELETE FROM game_items/).length, 1);
      assert.equal(fake.callsMatching(/UPDATE game_items SET rarity/).length, 0);
    });
  });
});
