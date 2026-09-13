/**
 * RealmService 边界测试：境界状态与突破（封顶、灵韵不足/恰好、并发境界变化、BIGINT）。
 *
 * 手动 new（userDb=FakeDatabase，character/stat 用 stub）。APP_CONFIG 临时改动在 finally 还原。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RealmService } from '../../../src/modules/logic/realm/internal/realm.service.js';
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
const CHAR: Character = { id: 5, realm: 1, lingyun: 100 };

function makeService(opts: {
  fake?: FakeDatabase;
  character?: Character | null;
  characterSeq?: Array<Character | null>;
}): {
  svc: RealmService;
  fake: FakeDatabase;
  stat: ReturnType<typeof stub>;
  character: ReturnType<typeof stub>;
} {
  const fake = opts.fake ?? new FakeDatabase();
  let idx = 0;
  const characterStub = stub(() => {
    if (opts.characterSeq) {
      const value = opts.characterSeq[Math.min(idx, opts.characterSeq.length - 1)];
      idx++;
      return value;
    }
    return opts.character === undefined ? CHAR : opts.character;
  });
  const stat = stub((..._a: unknown[]) => undefined);
  const svc = new RealmService(
    fake as never,
    { findByUserId: characterStub } as never,
    { increment: stat } as never,
  );
  return { svc, fake, stat, character: characterStub };
}

describe('RealmService.status 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND，不查库', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: null }).svc.status(7);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(fake.callCount, 0);
  });

  test('realm=0 -> nextCost=costs[0]=0，isMax=false（表首占位）', async () => {
    const res = await makeService({ character: { id: 5, realm: 0, lingyun: 0 } }).svc.status(7);
    const d = payload<{ nextCost: number | null; isMax: boolean }>(res);
    assert.equal(d.nextCost, APP_CONFIG.realmBreakthroughCosts[0]);
    assert.equal(d.isMax, false);
  });

  test('realm=1 -> costs[1]；realm=13 -> costs[13]（非封顶上界）', async () => {
    const r1 = payload<{ nextCost: number | null }>(
      await makeService({ character: { id: 5, realm: 1, lingyun: 0 } }).svc.status(7),
    );
    assert.equal(r1.nextCost, APP_CONFIG.realmBreakthroughCosts[1]);
    const r13 = payload<{ nextCost: number | null; isMax: boolean }>(
      await makeService({ character: { id: 5, realm: 13, lingyun: 0 } }).svc.status(7),
    );
    assert.equal(r13.nextCost, APP_CONFIG.realmBreakthroughCosts[13]);
    assert.equal(r13.isMax, false);
  });

  test('realm=14（封顶）-> nextCost=null、isMax=true', async () => {
    const res = await makeService({ character: { id: 5, realm: 14, lingyun: 0 } }).svc.status(7);
    const d = payload<{ nextCost: number | null; isMax: boolean; realm: number }>(res);
    assert.equal(d.nextCost, null);
    assert.equal(d.isMax, true);
    assert.equal(d.realm, 14);
  });

  test('realm=15（越界）-> nextCost=null、isMax=true', async () => {
    const res = await makeService({ character: { id: 5, realm: 15, lingyun: 0 } }).svc.status(7);
    const d = payload<{ nextCost: number | null; isMax: boolean }>(res);
    assert.equal(d.nextCost, null);
    assert.equal(d.isMax, true);
  });

  test('lingyun 原样返回（BIGINT 字符串也可透出）', async () => {
    const res = await makeService({
      character: { id: 5, realm: 1, lingyun: '777' as unknown as number },
    }).svc.status(7);
    assert.equal(payload<{ lingyun: unknown }>(res).lingyun, '777');
  });

  test('消耗表变短（index 缺失）-> nextCost=null（?? null 分支）', async () => {
    const original = APP_CONFIG.realmBreakthroughCosts;
    APP_CONFIG.realmBreakthroughCosts = [0, 200];
    try {
      const res = await makeService({ character: { id: 5, realm: 5, lingyun: 0 } }).svc.status(7);
      const d = payload<{ nextCost: number | null; isMax: boolean }>(res);
      assert.equal(d.nextCost, null);
      assert.equal(d.isMax, false);
    } finally {
      APP_CONFIG.realmBreakthroughCosts = original;
    }
  });
});

describe('RealmService.breakthrough 封顶边界', () => {
  test('realm=14 -> MAX_REALM_REACHED，不发 UPDATE', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: { id: 5, realm: 14, lingyun: 999999 } }).svc.breakthrough(7);
    assert.equal(codeOf(res), 'MAX_REALM_REACHED');
    assert.equal(fake.callCount, 0);
  });

  test('realm=15 -> MAX_REALM_REACHED', async () => {
    const fake = new FakeDatabase();
    const res = await makeService({ fake, character: { id: 5, realm: 15, lingyun: 99 } }).svc.breakthrough(7);
    assert.equal(codeOf(res), 'MAX_REALM_REACHED');
    assert.equal(fake.callCount, 0);
  });

  test('消耗表变短导致 cost=null -> MAX_REALM_REACHED（配置驱动分支）', async () => {
    const original = APP_CONFIG.realmBreakthroughCosts;
    APP_CONFIG.realmBreakthroughCosts = [];
    try {
      const fake = new FakeDatabase();
      const res = await makeService({ fake, character: { id: 5, realm: 1, lingyun: 999 } }).svc.breakthrough(7);
      assert.equal(codeOf(res), 'MAX_REALM_REACHED');
      assert.equal(fake.callCount, 0);
    } finally {
      APP_CONFIG.realmBreakthroughCosts = original;
    }
  });

  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const res = await makeService({ fake: new FakeDatabase(), character: null }).svc.breakthrough(7);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
  });
});

describe('RealmService.breakthrough 扣费与升级', () => {
  test('成功：UPDATE 参数 [cost, id, realm]，realm+1，lingyun 转 number，记 breakthrough_total', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, { rows: [{ realm: 2, lingyun: '0' }] });
    const { svc, stat } = makeService({ fake, character: { id: 5, realm: 1, lingyun: 200 } });
    const res = await svc.breakthrough(7);
    assert.equal(res.success, true);
    assert.deepEqual(fake.lastCall(/UPDATE characters/)?.params, [200, 5, 1]);
    const d = payload<{ realm: number; realmName: string; lingyun: number }>(res);
    assert.equal(d.realm, 2);
    assert.equal(typeof d.lingyun, 'number');
    assert.equal(d.lingyun, 0);
    assert.deepEqual(stat.last, [5, 'breakthrough_total', 1]);
  });

  test('恰好够：SQL 使用 lingyun >= $1 且 realm 快照守卫', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, { rows: [{ realm: 2, lingyun: '0' }] });
    const { svc } = makeService({ fake, character: { id: 5, realm: 1, lingyun: 200 } });
    await svc.breakthrough(7);
    const sql = fake.lastCall(/UPDATE characters/)?.sql ?? '';
    assert.match(sql, /lingyun >= \$1/);
    assert.match(sql, /realm = \$3/);
  });

  test('UPDATE 无行且境界已变 -> REALM_CHANGED（并发快照失配）', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, { rows: [] });
    const { svc } = makeService({
      fake,
      characterSeq: [
        { id: 5, realm: 1, lingyun: 200 },
        { id: 5, realm: 2, lingyun: 0 },
      ],
    });
    const res = await svc.breakthrough(7);
    assert.equal(codeOf(res), 'REALM_CHANGED');
  });

  test('UPDATE 无行且境界未变 -> LINGYUN_NOT_ENOUGH', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, { rows: [] });
    const { svc, stat } = makeService({
      fake,
      characterSeq: [
        { id: 5, realm: 1, lingyun: 50 },
        { id: 5, realm: 1, lingyun: 50 },
      ],
    });
    const res = await svc.breakthrough(7);
    assert.equal(codeOf(res), 'LINGYUN_NOT_ENOUGH');
    assert.match(res.message, /突破需 200/);
    assert.equal(stat.callCount, 0);
  });

  test('UPDATE 无行且二次查询角色消失 -> LINGYUN_NOT_ENOUGH', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, { rows: [] });
    const { svc } = makeService({
      fake,
      characterSeq: [{ id: 5, realm: 1, lingyun: 50 }, null],
    });
    const res = await svc.breakthrough(7);
    assert.equal(codeOf(res), 'LINGYUN_NOT_ENOUGH');
  });

  test('灵韵为 BIGINT 字符串（安全范围内）：UPDATE RETURNING 字符串 -> 精确 number', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, {
      rows: [{ realm: 2, lingyun: '9007199254740991' }],
    });
    const { svc } = makeService({
      fake,
      character: { id: 5, realm: 1, lingyun: 123 },
    });
    const res = await svc.breakthrough(7);
    assert.equal(res.success, true);
    assert.equal(payload<{ lingyun: number }>(res).lingyun, Number.MAX_SAFE_INTEGER);
  });

  test('灵韵超出安全整数范围（2^53）-> RangeError（fail-fast，不静默丢精度）', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, {
      rows: [{ realm: 2, lingyun: '9007199254740992' }],
    });
    const { svc } = makeService({
      fake,
      character: { id: 5, realm: 1, lingyun: 123 },
    });
    await assert.rejects(() => svc.breakthrough(7), RangeError);
  });

  test('UPDATE 抛错 -> Promise reject', async () => {
    const fake = new FakeDatabase().on(/UPDATE characters/, () => {
      throw new Error('realm boom');
    });
    await assert.rejects(
      () => makeService({ fake, character: { id: 5, realm: 1, lingyun: 200 } }).svc.breakthrough(7),
      /realm boom/,
    );
  });
});
