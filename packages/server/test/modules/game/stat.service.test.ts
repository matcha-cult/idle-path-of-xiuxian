import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StatService } from '../../../src/modules/game/stat/stat.service.js';
import { FakeDatabase } from '../../helpers/fake-db.js';

function makeService(db: FakeDatabase): StatService {
  return new StatService(db as never);
}

describe('StatService.increment 边界', () => {
  test('amount=0 -> 跳过，不落库', async () => {
    const db = new FakeDatabase();
    await makeService(db).increment(1, 'kill_total', 0);
    assert.equal(db.callCount, 0);
  });

  test('amount 缺省 -> 默认 1，写 ON CONFLICT 累加语句', async () => {
    const db = new FakeDatabase();
    await makeService(db).increment(7, 'kill_total');
    assert.equal(db.callCount, 1);
    assert.match(db.lastCall()?.sql ?? '', /INSERT INTO game_stat_counters/);
    assert.deepEqual(db.lastCall()?.params, [7, 'kill_total', 1]);
  });

  test('NaN / +Infinity / -Infinity -> 跳过（非有限数）', async () => {
    const db = new FakeDatabase();
    const svc = makeService(db);
    await svc.increment(1, 'k', Number.NaN);
    await svc.increment(1, 'k', Number.POSITIVE_INFINITY);
    await svc.increment(1, 'k', Number.NEGATIVE_INFINITY);
    assert.equal(db.callCount, 0);
  });

  // 边界说明：实现只过滤「非有限数 或 ===0」，负数并未跳过。
  // 任务清单里「负 amount 应跳过」在当前实现下不成立（契约允许负数修正），此处按真实行为断言。
  test('负 amount 当前实现会落库（不跳过）', async () => {
    const db = new FakeDatabase();
    await makeService(db).increment(1, 'k', -5);
    assert.equal(db.callCount, 1);
    assert.deepEqual(db.lastCall()?.params, [1, 'k', -5]);
  });

  test('小数 / MAX_SAFE_INTEGER -> 原样落库', async () => {
    const db = new FakeDatabase();
    const svc = makeService(db);
    await svc.increment(1, 'k', 0.5);
    await svc.increment(1, 'k', Number.MAX_SAFE_INTEGER);
    assert.equal(db.callCount, 2);
    assert.deepEqual(db.calls[0].params, [1, 'k', 0.5]);
    assert.deepEqual(db.calls[1].params, [1, 'k', Number.MAX_SAFE_INTEGER]);
  });

  test('空 key / 超长 key -> 不做校验直接落库', async () => {
    const db = new FakeDatabase();
    const svc = makeService(db);
    await svc.increment(1, '');
    await svc.increment(1, 'x'.repeat(5000));
    assert.equal(db.callCount, 2);
    assert.equal(db.calls[0].params[1], '');
    assert.equal((db.calls[1].params[1] as string).length, 5000);
  });

  test('DB 抛错 -> 向上抛出', async () => {
    const db = new FakeDatabase().onFallback(() => {
      throw new Error('db down');
    });
    await assert.rejects(makeService(db).increment(1, 'k'), /db down/);
  });
});

describe('StatService.recordKill 边界', () => {
  test('count=0 / 负数 -> 全部跳过，不落库', async () => {
    const db = new FakeDatabase();
    const svc = makeService(db);
    await svc.recordKill(1, 'slime', 1, 0);
    await svc.recordKill(1, 'slime', 1, -3);
    assert.equal(db.callCount, 0);
  });

  test('count=1 -> 写 kill_total / kill:<unit> / kill_realm:<realm> 三条', async () => {
    const db = new FakeDatabase();
    await makeService(db).recordKill(2, 'slime', 3, 1);
    assert.equal(db.callCount, 3);
    assert.deepEqual(db.calls.map((c) => c.params[1]), ['kill_total', 'kill:slime', 'kill_realm:3']);
    assert.ok(db.calls.every((c) => c.params[2] === 1));
  });

  test('count=MAX_SAFE_INTEGER -> 原样落库', async () => {
    const db = new FakeDatabase();
    await makeService(db).recordKill(1, 'slime', 1, Number.MAX_SAFE_INTEGER);
    assert.equal(db.callCount, 3);
    assert.ok(db.calls.every((c) => c.params[2] === Number.MAX_SAFE_INTEGER));
  });

  test('count=小数 -> 原样落库（仅 count<=0 被拦）', async () => {
    const db = new FakeDatabase();
    await makeService(db).recordKill(1, 'slime', 1, 2.5);
    assert.equal(db.callCount, 3);
    assert.ok(db.calls.every((c) => c.params[2] === 2.5));
  });

  test('count=NaN -> 三次 increment 均被非有限数过滤（无 SQL）', async () => {
    const db = new FakeDatabase();
    await makeService(db).recordKill(2, 'slime', 3, Number.NaN);
    assert.equal(db.callCount, 0);
  });

  test('realm / unitCode 边界无校验：realm=0/-1/14、空 unitCode 全部透传', async () => {
    const db = new FakeDatabase();
    const svc = makeService(db);
    for (const realm of [0, -1, 14]) await svc.recordKill(1, '', realm, 1);
    assert.deepEqual(db.calls.map((c) => c.params[1]), [
      'kill_total', 'kill:', 'kill_realm:0',
      'kill_total', 'kill:', 'kill_realm:-1',
      'kill_total', 'kill:', 'kill_realm:14',
    ]);
  });
});

describe('StatService.readAll 边界', () => {
  test('无行 -> 空 Map', async () => {
    const db = new FakeDatabase();
    const map = await makeService(db).readAll(1);
    assert.equal(map.size, 0);
  });

  test('多行 -> value 字符串转 number', async () => {
    const db = new FakeDatabase().on(/FROM game_stat_counters/, {
      rows: [
        { key: 'kill_total', value: '12' },
        { key: 'craft_total', value: '0' },
      ],
    });
    const map = await makeService(db).readAll(1);
    assert.equal(map.get('kill_total'), 12);
    assert.equal(map.get('craft_total'), 0);
  });

  test('value 非数值 -> NaN；空 key 保留', async () => {
    const db = new FakeDatabase().on(/FROM game_stat_counters/, {
      rows: [
        { key: 'bad', value: 'abc' },
        { key: '', value: '1' },
      ],
    });
    const map = await makeService(db).readAll(1);
    assert.ok(Number.isNaN(map.get('bad')));
    assert.equal(map.get(''), 1);
  });

  test('DB 抛错 -> 向上抛出', async () => {
    const db = new FakeDatabase().onFallback(() => {
      throw new Error('db down');
    });
    await assert.rejects(makeService(db).readAll(1), /db down/);
  });
});
