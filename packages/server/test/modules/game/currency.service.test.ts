/**
 * CurrencyService 边界测试：图鉴（通货/精华）与开发注入门禁。
 *
 * 手动 new，stub 角色与限流；gameDb 用 FakeDatabase。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CurrencyService } from '../../../src/modules/logic/economy/internal/currency.service.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';

type Result = { success: boolean; message: string; data?: unknown };
const payload = <T>(res: Result): T => res.data as T;
const codeOf = (res: Result): string => (res.data as { code?: string } | undefined)?.code ?? '';

interface Character {
  id: number;
  realm: number;
  lingyun: number;
}
const CHAR: Character = { id: 5, realm: 5, lingyun: 100 };

function makeService(opts: {
  fake: FakeDatabase;
  character?: Character | null;
  allow?: boolean;
}): { svc: CurrencyService; rate: ReturnType<typeof stub>; character: ReturnType<typeof stub> } {
  const character = opts.character === undefined ? CHAR : opts.character;
  const characterStub = stub(() => character);
  const rate = stub(() => opts.allow ?? true);
  const svc = new CurrencyService(
    opts.fake as never,
    { findByUserId: characterStub } as never,
    { allow: rate } as never,
  );
  return { svc, rate, character: characterStub };
}

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

describe('CurrencyService.catalog 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND，不查库', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.catalog(7);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(fake.callCount, 0);
  });

  test('通货表为空 -> currencies=[]', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_currencies/, { rows: [] })
      .on(/FROM game_wallets/, { rows: [] });
    const res = await makeService({ fake }).svc.catalog(7);
    assert.deepEqual(payload<{ currencies: unknown[] }>(res).currencies, []);
  });

  test('钱包命中 -> owned 取 amount 数值；缺省 0；description=null -> 空串', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_currencies/, {
        rows: [
          { id: 1, code: 'transmute', name: '蜕变石', description: null, implemented: true },
          { id: 2, code: 'alchemy', name: '点金石', description: '稀有', implemented: false },
        ],
      })
      .on(/FROM game_wallets/, { rows: [{ currency_code: 'transmute', amount: '42' }] });
    const res = await makeService({ fake }).svc.catalog(7);
    const currencies = payload<{
      currencies: Array<{ code: string; owned: number; description: string; implemented: boolean }>;
    }>(res).currencies;
    assert.equal(currencies[0].owned, 42);
    assert.equal(currencies[0].description, '');
    assert.equal(currencies[1].owned, 0);
    assert.equal(currencies[1].implemented, false);
  });

  test('amount=0（BIGINT 字符串）-> owned=0', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_currencies/, { rows: [{ id: 1, code: 'transmute', name: '蜕变石', description: 'x', implemented: true }] })
      .on(/FROM game_wallets/, { rows: [{ currency_code: 'transmute', amount: '0' }] });
    const res = await makeService({ fake }).svc.catalog(7);
    assert.equal(payload<{ currencies: Array<{ owned: number }> }>(res).currencies[0].owned, 0);
  });

  test('查询抛错 -> Promise reject', async () => {
    const fake = new FakeDatabase().on(/FROM game_currencies/, () => {
      throw new Error('currency boom');
    });
    await assert.rejects(() => makeService({ fake }).svc.catalog(7), /currency boom/);
  });
});

describe('CurrencyService.grant 边界', () => {
  test('NODE_ENV=production -> FORBIDDEN，不解析角色/不限流', async () => {
    await withProduction(async () => {
      const fake = new FakeDatabase();
      const { svc, rate, character } = makeService({ fake });
      const res = await svc.grant(7, 'transmute', 1);
      assert.equal(codeOf(res), 'FORBIDDEN');
      assert.equal(character.callCount, 0);
      assert.equal(rate.callCount, 0);
    });
  });

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.grant(7, 'transmute', 1);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  const badCounts: unknown[] = [0, -1, -9999, 10000, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, '1'];
  for (const count of badCounts) {
    test('count=' + JSON.stringify(count) + '（非 1~9999 整数）-> INVALID_PARAM，且不限流', async () => {
      const fake = new FakeDatabase();
      const { svc, rate } = makeService({ fake });
      const res = await svc.grant(7, 'transmute', count as number);
      assert.equal(codeOf(res), 'INVALID_PARAM');
      assert.equal(rate.callCount, 0);
    });
  }

  test('count=1 / 9999（上下界）-> 通过', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_currencies/, { rows: [{ id: 1, name: '蜕变石' }] })
      .on(/INSERT INTO game_wallets/, { rows: [{ amount: '1' }] });
    assert.equal((await makeService({ fake }).svc.grant(7, 'transmute', 1)).success, true);
    assert.equal((await makeService({ fake }).svc.grant(7, 'transmute', 9999)).success, true);
  });

  test('限流拒绝 -> RATE_LIMITED，额度取 APP_CONFIG', async () => {
    const fake = new FakeDatabase();
    const { svc, rate } = makeService({ fake, allow: false });
    const res = await svc.grant(7, 'transmute', 1);
    assert.equal(codeOf(res), 'RATE_LIMITED');
    assert.equal(rate.last?.[0], 7);
    assert.equal(rate.last?.[1], APP_CONFIG.devToolRateLimitPerMinute);
  });

  test('code 空串 -> 走到查询后 CURRENCY_NOT_FOUND（当前无入参校验）', async () => {
    const fake = new FakeDatabase().on(/FROM game_currencies/, { rows: [] });
    const res = await makeService({ fake }).svc.grant(7, '', 1);
    assert.equal(codeOf(res), 'CURRENCY_NOT_FOUND');
    assert.deepEqual(fake.lastCall(/FROM game_currencies/)?.params, ['']);
  });

  test('通货不存在 -> CURRENCY_NOT_FOUND（限流已消耗）', async () => {
    const fake = new FakeDatabase().on(/FROM game_currencies/, { rows: [] });
    const { svc, rate } = makeService({ fake });
    const res = await svc.grant(7, 'nope', 1);
    assert.equal(codeOf(res), 'CURRENCY_NOT_FOUND');
    assert.equal(rate.callCount, 1);
  });

  test('成功 -> upsert 钱包，返回 Number(amount)', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_currencies/, { rows: [{ id: 1, name: '蜕变石' }] })
      .on(/INSERT INTO game_wallets/, { rows: [{ amount: '43' }] });
    const res = await makeService({ fake }).svc.grant(7, 'transmute', 3);
    assert.equal(res.success, true);
    assert.equal(payload<{ amount: number }>(res).amount, 43);
    assert.deepEqual(fake.lastCall(/INSERT INTO game_wallets/)?.params, [5, 'transmute', 3]);
    assert.match(res.message, /蜕变石/);
  });
});

describe('CurrencyService.catalogEssences 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.catalogEssences(7);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  test('空表 -> essences=[]', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_essences/, { rows: [] })
      .on(/FROM game_essence_inventory/, { rows: [] });
    const res = await makeService({ fake }).svc.catalogEssences(7);
    assert.deepEqual(payload<{ essences: unknown[] }>(res).essences, []);
  });

  test('持有量按 essence_id 归并；缺省 0；description=null -> 空串', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_essences/, {
        rows: [
          { id: 1, code: 'e_atk', name: '攻击精华', polarity: 'prefix', target_family: 'atk', description: null },
          { id: 2, code: 'e_def', name: '防御精华', polarity: 'suffix', target_family: 'def', description: 'd' },
        ],
      })
      .on(/FROM game_essence_inventory/, { rows: [{ essence_id: 1, count: '7' }] });
    const res = await makeService({ fake }).svc.catalogEssences(7);
    const essences = payload<{
      essences: Array<{ targetFamily: string; description: string; owned: number }>;
    }>(res).essences;
    assert.equal(essences[0].owned, 7);
    assert.equal(essences[0].targetFamily, 'atk');
    assert.equal(essences[0].description, '');
    assert.equal(essences[1].owned, 0);
  });
});

describe('CurrencyService.grantEssence 边界', () => {
  test('production -> FORBIDDEN', async () => {
    await withProduction(async () => {
      const fake = new FakeDatabase();
      const res = await makeService({ fake }).svc.grantEssence(7, 'e_atk', 1);
      assert.equal(codeOf(res), 'FORBIDDEN');
    });
  });

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.grantEssence(7, 'e_atk', 1);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });

  const badCounts: unknown[] = [0, -1, 100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1'];
  for (const count of badCounts) {
    test('count=' + JSON.stringify(count) + '（非 1~99 整数）-> INVALID_PARAM，且不限流', async () => {
      const fake = new FakeDatabase();
      const { svc, rate } = makeService({ fake });
      const res = await svc.grantEssence(7, 'e_atk', count as number);
      assert.equal(codeOf(res), 'INVALID_PARAM');
      assert.equal(rate.callCount, 0);
    });
  }

  test('count=1 / 99（上下界）-> 通过', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_essences/, { rows: [{ id: 1, name: '攻击精华' }] })
      .on(/INSERT INTO game_essence_inventory/, { rows: [{ count: '1' }] });
    assert.equal((await makeService({ fake }).svc.grantEssence(7, 'e_atk', 1)).success, true);
    assert.equal((await makeService({ fake }).svc.grantEssence(7, 'e_atk', 99)).success, true);
  });

  test('限流拒绝 -> RATE_LIMITED，额度取 APP_CONFIG', async () => {
    const fake = new FakeDatabase();
    const { svc, rate } = makeService({ fake, allow: false });
    const res = await svc.grantEssence(7, 'e_atk', 1);
    assert.equal(codeOf(res), 'RATE_LIMITED');
    assert.equal(rate.last?.[1], APP_CONFIG.devToolRateLimitPerMinute);
  });

  test('code 空串 / 不存在 -> ESSENCE_NOT_FOUND', async () => {
    const fake = new FakeDatabase().on(/FROM game_essences/, { rows: [] });
    assert.equal(codeOf(await makeService({ fake }).svc.grantEssence(7, '', 1)), 'ESSENCE_NOT_FOUND');
    assert.equal(codeOf(await makeService({ fake }).svc.grantEssence(7, 'nope', 1)), 'ESSENCE_NOT_FOUND');
  });

  test('成功 -> upsert 精华存量，count=Number(count)', async () => {
    const fake = new FakeDatabase()
      .on(/FROM game_essences/, { rows: [{ id: 1, name: '攻击精华' }] })
      .on(/INSERT INTO game_essence_inventory/, { rows: [{ count: '8' }] });
    const res = await makeService({ fake }).svc.grantEssence(7, 'e_atk', 2);
    assert.equal(res.success, true);
    assert.equal(payload<{ count: number }>(res).count, 8);
    assert.deepEqual(fake.lastCall(/INSERT INTO game_essence_inventory/)?.params, [5, 1, 2]);
  });
});
