import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RedisService } from '../../src/modules/health/redis.service.js';
import { stub } from '../helpers/stub.js';

interface FakeClient {
  status: string;
  connect: ReturnType<typeof stub>;
  ping: ReturnType<typeof stub>;
  disconnect: ReturnType<typeof stub>;
}

function makeService(): { service: RedisService; client: FakeClient } {
  const service = new RedisService();
  const client: FakeClient = {
    status: 'wait',
    connect: stub(async () => { client.status = 'ready'; }),
    ping: stub(async () => 'PONG'),
    disconnect: stub(() => undefined),
  };
  (service as unknown as { client: FakeClient }).client = client;
  return { service, client };
}

describe('RedisService.ping 边界', () => {
  test('status=wait -> 先 connect 再 ping', async () => {
    const { service, client } = makeService();
    assert.equal(await service.ping(), 'PONG');
    assert.equal(client.connect.callCount, 1);
    assert.equal(client.ping.callCount, 1);
  });

  test('status=ready -> 不 connect，直接 ping', async () => {
    const { service, client } = makeService();
    client.status = 'ready';
    assert.equal(await service.ping(), 'PONG');
    assert.equal(client.connect.callCount, 0);
    assert.equal(client.ping.callCount, 1);
  });

  test('connect 后仍非 ready -> 抛错并带状态', async () => {
    const { service, client } = makeService();
    client.connect = stub(async () => { client.status = 'connecting'; });
    await assert.rejects(() => service.ping(), /redis unavailable \(status: connecting\)/);
    assert.equal(client.ping.callCount, 0);
  });

  test('status=end / reconnecting / close 直接抛错', async () => {
    for (const status of ['end', 'reconnecting', 'close']) {
      const { service, client } = makeService();
      client.status = status;
      await assert.rejects(() => service.ping(), new RegExp(`redis unavailable \\(status: ${status}\\)`));
    }
  });

  test('connect 抛错 -> 原样传播', async () => {
    const { service, client } = makeService();
    client.connect = stub(async () => { throw new Error('connect refused'); });
    await assert.rejects(() => service.ping(), /connect refused/);
  });

  test('ping 返回非 PONG 时原样返回（校验在 HealthService 侧）', async () => {
    const { service, client } = makeService();
    client.status = 'ready';
    client.ping = stub(async () => 'NOPE');
    assert.equal(await service.ping(), 'NOPE');
  });
});

describe('RedisService 生命周期边界', () => {
  test('构造不抛错（懒连接）', () => {
    assert.doesNotThrow(() => new RedisService());
  });

  test('onModuleDestroy 调用 disconnect', async () => {
    const { service, client } = makeService();
    await service.onModuleDestroy();
    assert.equal(client.disconnect.callCount, 1);
  });

  test('onModuleDestroy 吞掉 disconnect 异常', async () => {
    const { service, client } = makeService();
    client.disconnect = stub(() => { throw new Error('already closed'); });
    await assert.doesNotReject(() => service.onModuleDestroy());
  });
});
