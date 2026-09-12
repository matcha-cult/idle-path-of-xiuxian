import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { HealthService } from '../../src/modules/health/health.service.js';
import { FakeDatabase } from '../helpers/fake-db.js';
import { FakeRedis } from '../helpers/fake-redis.js';

function makeService(fake: FakeDatabase, redis: FakeRedis): HealthService {
  return new HealthService(fake as never, redis as never);
}

describe('HealthService.checkDatabase 边界', () => {
  test('可用 -> up', async () => {
    const fake = new FakeDatabase().on(/SELECT 1/, { rows: [{ '?column?': 1 }] });
    const res = await makeService(fake, new FakeRedis()).checkDatabase();
    assert.equal(res.status, 'up');
    assert.ok(res.latencyMs >= 0);
  });

  test('抛错 -> down 且带 error', async () => {
    const fake = new FakeDatabase().onFallback(() => { throw new Error('db down'); });
    const res = await makeService(fake, new FakeRedis()).checkDatabase();
    assert.equal(res.status, 'down');
    assert.match(String(res.error), /db down/);
  });

  test('超时（2s）-> down', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const fake = new FakeDatabase().onFallback(() => new Promise<never>(() => undefined));
      const promise = makeService(fake, new FakeRedis()).checkDatabase();
      mock.timers.tick(2001);
      const res = await promise;
      assert.equal(res.status, 'down');
      assert.match(String(res.error), /timeout/);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('HealthService.checkRedis 边界', () => {
  test('PONG -> up', async () => {
    const redis = new FakeRedis();
    const res = await makeService(new FakeDatabase(), redis).checkRedis();
    assert.equal(res.status, 'up');
    assert.equal(redis.pingCount, 1);
  });

  test('非 PONG 响应 -> down', async () => {
    const redis = new FakeRedis();
    redis.mode = 'wrong';
    const res = await makeService(new FakeDatabase(), redis).checkRedis();
    assert.equal(res.status, 'down');
    assert.match(String(res.error), /unexpected ping/);
  });

  test('抛错 -> down', async () => {
    const redis = new FakeRedis();
    redis.mode = 'throw';
    const res = await makeService(new FakeDatabase(), redis).checkRedis();
    assert.equal(res.status, 'down');
  });
});

describe('HealthService.overall 边界', () => {
  test('DB+Redis 均 up -> ok', async () => {
    const fake = new FakeDatabase().on(/SELECT 1/, { rows: [] });
    const report = await makeService(fake, new FakeRedis()).overall();
    assert.equal(report.status, 'ok');
    assert.equal(report.checks.database.status, 'up');
    assert.equal(report.checks.redis.status, 'up');
    assert.ok(Number.isFinite(Date.parse(report.timestamp)));
  });

  test('任一 down -> degraded', async () => {
    const fake = new FakeDatabase().onFallback(() => { throw new Error('nope'); });
    const report = await makeService(fake, new FakeRedis()).overall();
    assert.equal(report.status, 'degraded');
    assert.equal(report.checks.database.status, 'down');
  });
});
