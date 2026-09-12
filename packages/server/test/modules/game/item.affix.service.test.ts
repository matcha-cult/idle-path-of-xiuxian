/**
 * ItemAffixService 边界测试：生成（rarity/base 校验）、加权抽样、重 roll、池查询、渲染。
 *
 * 只依赖 gameDb.query，全部手动 new，绝不用 NestJS 容器。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ItemAffixService } from '../../../src/modules/game/item/item.affix.service.js';
import { FakeDatabase } from '../../helpers/fake-db.js';

type Result = { success: boolean; message: string; data?: unknown };
const payload = <T>(res: Result): T => res.data as T;
const codeOf = (res: Result): string => (res.data as { code?: string } | undefined)?.code ?? '';

function makeService(fake: FakeDatabase): ItemAffixService {
  return new ItemAffixService(fake as never);
}

function baseRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 2,
    code: 'sword',
    name: '铁剑',
    category: 'weapon',
    slot: 'weapon',
    sub_type: null,
    tier: 1,
    base_stats: null,
    implicit_affixes: null,
    unique_affixes: null,
    rarity_limit: 3,
    drop_weight: 100,
    ...over,
  };
}

function affixRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    code: 'atk_1',
    name: '利刃',
    polarity: 'prefix',
    tier: 1,
    effects: '{"atk":5}',
    value_func: '{"key":"atk","minPerTier":1,"maxPerTier":2,"decimals":0}',
    weight: 10,
    is_fractured: false,
    ...over,
  };
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

describe('ItemAffixService.generateItem 基底与 rarity 校验', () => {
  test('基底不存在 -> BASE_NOT_FOUND（SQL 无行）', async () => {
    const fake = new FakeDatabase().on(/FROM game_item_bases/, { rows: [] });
    const res = await makeService(fake).generateItem(99, 0);
    assert.equal(codeOf(res), 'BASE_NOT_FOUND');
  });

  const invalidRarities: unknown[] = [-1, 4, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null, undefined];
  for (const rarity of invalidRarities) {
    test('rarity=' + JSON.stringify(rarity) + '（非 0~3 整数）-> INVALID_PARAM', async () => {
      const fake = new FakeDatabase().on(/FROM game_item_bases/, { rows: [baseRow()] });
      const res = await makeService(fake).generateItem(2, rarity as number);
      assert.equal(codeOf(res), 'INVALID_PARAM');
    });
  }

  test('rarity=0 / 3（上下界）合法', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow()] })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    assert.equal((await makeService(fake).generateItem(2, 0)).success, true);
    assert.equal((await makeService(fake).generateItem(2, 3)).success, true);
  });

  test('rarity 超过 base.rarity_limit -> RARITY_EXCEEDS_LIMIT', async () => {
    const fake = new FakeDatabase().on(/FROM game_item_bases/, { rows: [baseRow({ rarity_limit: 1 })] });
    const res = await makeService(fake).generateItem(2, 2);
    assert.equal(codeOf(res), 'RARITY_EXCEEDS_LIMIT');
    assert.match(res.message, /灵品/);
  });

  test('rarity=rarity_limit（恰好等于）-> 通过', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow({ rarity_limit: 2 })] })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    const res = await makeService(fake).generateItem(2, 2);
    assert.equal(res.success, true);
  });

  test('基底查询抛错 -> Promise reject', async () => {
    const fake = new FakeDatabase().on(/FROM game_item_bases/, () => {
      throw new Error('base boom');
    });
    await assert.rejects(() => makeService(fake).generateItem(2, 0), /base boom/);
  });
});

describe('ItemAffixService.generateItem 词条装配', () => {
  test('rarity=0 无基底词缀 -> insert affixes=[]', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow()] })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    await makeService(fake).generateItem(2, 0);
    assert.equal(fake.lastCall(/INSERT INTO game_items/)?.params[4], '[]');
  });

  test('rarity=0 基底词缀非法 JSON -> 视为无词缀', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow({ implicit_affixes: '{bad' })] })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    await makeService(fake).generateItem(2, 0);
    assert.equal(fake.lastCall(/INSERT INTO game_items/)?.params[4], '[]');
  });

  test('rarity=0 固定复制 implicit 词缀（不 roll，value=null）', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow({ implicit_affixes: '["a_1"]' })] })
      .on(/FROM game_affixes WHERE code = ANY/, { rows: [affixRow({ id: 5, code: 'a_1', polarity: 'base' })] })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    await makeService(fake).generateItem(2, 0);
    const entries = JSON.parse(String(fake.lastCall(/INSERT INTO game_items/)?.params[4]));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].affixId, 5);
    assert.equal(entries[0].value, null);
    assert.equal(entries[0].polarity, 'base');
  });

  test('rarity=3 传奇 -> 固定 unique 词缀（不 roll）', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow({ unique_affixes: '["u_1"]' })] })
      .on(/FROM game_affixes WHERE code = ANY/, {
        rows: [affixRow({ id: 7, code: 'u_1', polarity: 'suffix' })],
      })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    await makeService(fake).generateItem(2, 3);
    const entries = JSON.parse(String(fake.lastCall(/INSERT INTO game_items/)?.params[4]));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].affixId, 7);
    assert.equal(entries[0].polarity, 'suffix');
    assert.equal(entries[0].value, null);
  });

  test('rarity=1/2 -> 走池查询后落库成功', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow()] })
      .on(/FROM game_base_affix_pools/, { rows: [] })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    assert.equal((await makeService(fake).generateItem(2, 1)).success, true);
    assert.equal((await makeService(fake).generateItem(2, 2)).success, true);
  });

  test('INSERT 无 RETURNING 行 -> reject（当前实现未兜底）', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow()] })
      .on(/INSERT INTO game_items/, { rows: [] });
    await assert.rejects(() => makeService(fake).generateItem(2, 0));
  });

  test('tier 由基底决定；characterId 缺省为 null，显式传入时透传', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_item_bases/, { rows: [baseRow({ tier: 9 })] })
      .on(/INSERT INTO game_items/, { rows: [{ id: '10' }] });
    await makeService(fake).generateItem(2, 0);
    assert.equal(fake.lastCall(/INSERT INTO game_items/)?.params[0], null);
    assert.equal(fake.lastCall(/INSERT INTO game_items/)?.params[3], 9);
    await makeService(fake).generateItem(2, 0, 5);
    assert.equal(fake.lastCall(/INSERT INTO game_items/)?.params[0], 5);
  });
});

describe('ItemAffixService.findAffixesByIds 边界', () => {
  test('空数组 -> [] 且不发查询', async () => {
    const fake = new FakeDatabase();
    const rows = await makeService(fake).findAffixesByIds([]);
    assert.deepEqual(rows, []);
    assert.equal(fake.callCount, 0);
  });

  test('单元素/重复元素 -> 参数原样传递', async () => {
    const fake = new FakeDatabase().on(/FROM game_affixes WHERE id = ANY/, { rows: [affixRow()] });
    const rows = await makeService(fake).findAffixesByIds([1]);
    assert.equal(rows.length, 1);
    assert.deepEqual(fake.lastCall(/FROM game_affixes WHERE id = ANY/)?.params, [[1]]);
    await makeService(fake).findAffixesByIds([1, 1, 1]);
    assert.deepEqual(fake.lastCall(/FROM game_affixes WHERE id = ANY/)?.params, [[1, 1, 1]]);
  });
});

describe('ItemAffixService.rerollEntryValues 保全规则', () => {
  test('基底/天定条目原样保留，普通条目重 roll', async () => {
    const baseEntry = { affixId: 9, value: null, polarity: 'base', key: null };
    const fractured = { affixId: 2, value: 5, polarity: 'prefix', key: 'atk' };
    const normal = { affixId: 1, value: 5, polarity: 'prefix', key: 'atk' };
    const fake = new FakeDatabase().on(/FROM game_affixes WHERE id = ANY/, {
      rows: [
        affixRow({ id: 1, is_fractured: false }),
        affixRow({ id: 2, is_fractured: true }),
      ],
    });
    const out = await makeService(fake).rerollEntryValues([baseEntry, fractured, normal] as never);
    assert.deepEqual(out[0], baseEntry);
    assert.deepEqual(out[1], fractured);
    assert.notEqual(out[2], normal);
    assert.ok((out[2].value as number) >= 1 && (out[2].value as number) <= 2);
  });

  test('key 存在但 value=null 的条目保持不变（不参与重 roll）', async () => {
    const e = { affixId: 1, value: null, polarity: 'prefix', key: 'atk' };
    const fake = new FakeDatabase().on(/FROM game_affixes WHERE id = ANY/, { rows: [affixRow()] });
    const out = await makeService(fake).rerollEntryValues([e] as never);
    assert.deepEqual(out[0], e);
  });

  test('空 entries -> []（不发查询）', async () => {
    const fake = new FakeDatabase();
    const out = await makeService(fake).rerollEntryValues([]);
    assert.deepEqual(out, []);
    assert.equal(fake.callCount, 0);
  });
});

describe('ItemAffixService 池查询与抽样边界', () => {
  test('queryRollPoolFor：窗口 tierMin>=1 且 tierMax=base.tier', async () => {
    const fake = new FakeDatabase().on(/FROM game_base_affix_pools/, { rows: [affixRow()] });
    const svc = makeService(fake);
    await svc.queryRollPoolFor({ id: 2, tier: 5 } as never, 'prefix');
    assert.deepEqual(fake.lastCall(/FROM game_base_affix_pools/)?.params?.slice(0, 2), [2, 'prefix']);
    assert.equal(fake.lastCall(/FROM game_base_affix_pools/)?.params?.[3], 5);
    assert.ok((fake.lastCall(/FROM game_base_affix_pools/)?.params?.[2] as number) >= 1);

    await svc.queryRollPoolFor({ id: 2, tier: 1 } as never, 'suffix');
    assert.equal(fake.lastCall(/FROM game_base_affix_pools/)?.params?.[2], 1);
    assert.equal(fake.lastCall(/FROM game_base_affix_pools/)?.params?.[3], 1);
  });

  test('samplePoolRows：k=0 -> []；同族去重；k 超过池大小不越界', async () => {
    const svc = makeService(new FakeDatabase());
    assert.deepEqual(svc.samplePoolRows([affixRow()] as never, 0), []);
    const sameFamily = [affixRow({ id: 1, code: 'atk_1' }), affixRow({ id: 2, code: 'atk_2' })];
    const picked = svc.samplePoolRows(sameFamily as never, 5);
    assert.equal(picked.length, 1);

    const twoFamilies = [affixRow({ id: 1, code: 'atk_1' }), affixRow({ id: 2, code: 'def_1' })];
    const picked2 = svc.samplePoolRows(twoFamilies as never, 5);
    assert.equal(picked2.length, 2);
    const families = new Set(picked2.map((r) => r.code.replace(/_\d+$/, '')));
    assert.equal(families.size, 2);
  });

  test('rollOneFromRows：空集 -> null；非空 -> 条目', async () => {
    const svc = makeService(new FakeDatabase());
    assert.equal(svc.rollOneFromRows([]), null);
    const entry = svc.rollOneFromRows([affixRow({ id: 3 })] as never);
    assert.equal(entry?.affixId, 3);
    assert.equal(entry?.key, 'atk');
  });

  test('rollRow：无 value_func / 无 key / 非法 JSON -> value=null,key=null', async () => {
    const svc = makeService(new FakeDatabase());
    for (const vf of [null, '{}', '{bad']) {
      const entry = svc.rollRow(affixRow({ value_func: vf }) as never);
      assert.equal(entry.value, null);
      assert.equal(entry.key, null);
    }
  });

  test('rollRow：数值在 [minPerTier*tier, maxPerTier*tier] 内', async () => {
    const svc = makeService(new FakeDatabase());
    await withRandom(0, async () => {
      const entry = svc.rollRow(
        affixRow({ tier: 3, value_func: '{"key":"atk","minPerTier":2,"maxPerTier":4,"decimals":0}' }) as never,
      );
      assert.equal(entry.value, 6);
    });
    await withRandom(0.999999, async () => {
      const entry = svc.rollRow(
        affixRow({ tier: 3, value_func: '{"key":"atk","minPerTier":2,"maxPerTier":4,"decimals":0}' }) as never,
      );
      assert.equal(entry.value, 12);
    });
  });

  test('allocCountsFor：total=1 随机单边；total=2/6 满足前后缀上限', async () => {
    const svc = makeService(new FakeDatabase());
    await withRandom(0.1, async () => {
      const a = svc.allocCountsFor(1, 1, 1);
      assert.deepEqual(a, { prefixCount: 1, suffixCount: 0 });
    });
    await withRandom(0.9, async () => {
      const a = svc.allocCountsFor(1, 1, 1);
      assert.deepEqual(a, { prefixCount: 0, suffixCount: 1 });
    });
    const two = svc.allocCountsFor(2, 1, 1);
    assert.deepEqual(two, { prefixCount: 1, suffixCount: 1 });
    const six = svc.allocCountsFor(6, 3, 3);
    assert.equal(six.prefixCount + six.suffixCount, 6);
    assert.ok(six.prefixCount <= 3 && six.suffixCount <= 3);
    const zero = svc.allocCountsFor(0, 3, 3);
    assert.deepEqual(zero, { prefixCount: 0, suffixCount: 0 });
  });
});

describe('ItemAffixService 渲染边界', () => {
  test('renderAffixTexts：roll 条目带标签与 T 阶；百分比键加 %', () => {
    const svc = makeService(new FakeDatabase());
    const byId = new Map<number, never>([
      [1, affixRow({ id: 1, name: '利刃', tier: 3, code: 'atk_1' }) as never],
      [2, affixRow({ id: 2, name: '暴戾', tier: 2, code: 'crit_1' }) as never],
    ]);
    const texts = svc.renderAffixTexts(
      [
        { affixId: 1, value: 5, polarity: 'prefix', key: 'atk' },
        { affixId: 2, value: 3.5, polarity: 'suffix', key: 'crit' },
      ],
      byId,
    );
    assert.match(texts[0], /利刃/);
    assert.match(texts[0], /T3/);
    assert.match(texts[0], /攻击 \+5/);
    assert.match(texts[1], /暴击 \+3\.5%/);
  });

  test('renderAffixTexts：key=null 使用 effects，基底/固定标签区分；缺失行跳过', () => {
    const svc = makeService(new FakeDatabase());
    const byId = new Map<number, never>([
      [1, affixRow({ id: 1, name: '基', polarity: 'base', effects: '{"atk":2}' }) as never],
      [2, affixRow({ id: 2, name: '固', polarity: 'prefix', effects: '{"def":1}' }) as never],
      [3, affixRow({ id: 3, name: '空', polarity: 'prefix', effects: '{}' }) as never],
    ]);
    const texts = svc.renderAffixTexts(
      [
        { affixId: 1, value: null, polarity: 'base', key: null },
        { affixId: 2, value: null, polarity: 'prefix', key: null },
        { affixId: 3, value: null, polarity: 'prefix', key: null },
        { affixId: 99, value: null, polarity: 'prefix', key: null },
      ],
      byId,
    );
    assert.equal(texts.length, 3);
    assert.match(texts[0], /（基底）/);
    assert.match(texts[1], /（固定）/);
    assert.doesNotMatch(texts[2], /\+/);
  });

  test('renderAffixTexts：天定标记（entry.fractured / row.is_fractured）', () => {
    const svc = makeService(new FakeDatabase());
    const byId = new Map<number, never>([[1, affixRow({ id: 1, is_fractured: true }) as never]]);
    const texts = svc.renderAffixTexts([{ affixId: 1, value: 2, polarity: 'prefix', key: 'atk' }], byId);
    assert.match(texts[0], /天定/);
  });

  test('renderItem：rarity 越界 -> 未知；缺失词缀定义 -> code/name 兜底；createdAt 可选', async () => {
    const fake = new FakeDatabase().on(/FROM game_affixes WHERE id = ANY/, { rows: [] });
    const svc = makeService(fake);
    const view = await svc.renderItem(1, 2, 'sword', '铁剑', 'weapon', 'weapon', 9, 3, 0, 'bag', [
      { affixId: 123, value: 1, polarity: 'prefix', key: 'atk' },
    ]);
    assert.equal(view.rarityName, '未知');
    assert.equal(view.affixes[0].code, '');
    assert.equal(view.affixes[0].name, '');
    assert.equal(view.affixes[0].tier, 0);
    assert.equal('createdAt' in view, false);

    const withDate = await svc.renderItem(
      1, 2, 'sword', '铁剑', 'weapon', 'weapon', 1, 3, 0, 'bag', [], '2025-01-01',
    );
    assert.equal(withDate.rarityName, '灵品');
    assert.equal(withDate.createdAt, '2025-01-01');
  });
});
