import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WarWsClient } from '../../scripts/sdk/ws-client.js';
import { FakeWebSocket } from '../helpers/fake-ws.js';

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function makeClient(overrides: Record<string, unknown> = {}): WarWsClient {
  FakeWebSocket.reset();
  return new WarWsClient({
    url: 'ws://test/ws',
    WebSocketImpl: FakeWebSocket,
    heartbeatMs: 0,
    requestTimeoutMs: 100,
    reconnectBaseDelayMs: 60_000,
    reconnectMaxDelayMs: 60_000,
    ...overrides,
  });
}

async function connected(client: WarWsClient): Promise<void> {
  const promise = client.connect();
  await tick();
  FakeWebSocket.latest.emitOpen();
  await promise;
}

describe('SDK 连接与请求信封', () => {
  test('open 前后 connected 状态', async () => {
    const client = makeClient();
    const promise = client.connect();
    await tick();
    assert.equal(client.connected, false);
    FakeWebSocket.latest.emitOpen();
    await promise;
    assert.equal(client.connected, true);
    client.close();
  });

  test('信封含 reqId，且注入 __token', async () => {
    const client = makeClient({ getToken: () => 'tk' });
    await connected(client);
    const promise = client.call(30, 1, { page: 2 });
    await tick();
    const req = FakeWebSocket.latest.lastRequest();
    assert.equal(req.cmd, 30);
    assert.equal(req.subCmd, 1);
    assert.deepEqual(req.data, { page: 2, __token: 'tk' });
    assert.equal(typeof req.reqId, 'string');
    FakeWebSocket.latest.emitMessage({ reqId: req.reqId, kind: 'response', data: { success: true } });
    assert.deepEqual((await promise).data, { success: true });
    client.close();
  });

  test('无 token 时不注入 __token', async () => {
    const client = makeClient({ getToken: () => undefined });
    await connected(client);
    const promise = client.call(1, 1, {});
    await tick();
    assert.equal('__token' in FakeWebSocket.latest.lastRequest().data, false);
    const id = FakeWebSocket.latest.lastRequest().reqId;
    FakeWebSocket.latest.emitMessage({ reqId: id, data: {} });
    await promise;
    client.close();
  });

  test('每次请求重新取 token（重连后可用新 token）', async () => {
    let token = 't1';
    const client = makeClient({ getToken: () => token });
    await connected(client);
    const p1 = client.call(30, 1, {});
    await tick();
    assert.equal(FakeWebSocket.latest.lastRequest().data.__token, 't1');
    FakeWebSocket.latest.emitMessage({ reqId: FakeWebSocket.latest.lastRequest().reqId, data: {} });
    await p1;
    token = 't2';
    const p2 = client.call(30, 1, {});
    await tick();
    assert.equal(FakeWebSocket.latest.lastRequest().data.__token, 't2');
    FakeWebSocket.latest.emitMessage({ reqId: FakeWebSocket.latest.lastRequest().reqId, data: {} });
    await p2;
    client.close();
  });
});

describe('SDK 并发与 reqId 配对', () => {
  test('并发：多个请求同时发出，不需要串行等待', async () => {
    const client = makeClient();
    await connected(client);
    const p1 = client.call(30, 1, { n: 1 });
    const p2 = client.call(30, 2, { n: 2 });
    const p3 = client.call(30, 3, { n: 3 });
    await tick();
    assert.equal(FakeWebSocket.latest.sent.length, 3, '三个请求应同时发出');
    assert.equal(client.inFlight, 3);
    const ids = FakeWebSocket.latest.requests().map((r) => r.reqId);
    assert.equal(new Set(ids).size, 3, 'reqId 必须互不相同');
    client.close();
    await Promise.allSettled([p1, p2, p3]);
  });

  test('乱序响应按 reqId 精确配对', async () => {
    const client = makeClient();
    await connected(client);
    const p1 = client.call(30, 1, {});
    const p2 = client.call(30, 2, {});
    await tick();
    const [r1, r2] = FakeWebSocket.latest.requests();
    // 先回第二个，再回第一个
    FakeWebSocket.latest.emitMessage({ reqId: r2.reqId, data: 'second' });
    FakeWebSocket.latest.emitMessage({ reqId: r1.reqId, data: 'first' });
    assert.equal((await p1).data, 'first');
    assert.equal((await p2).data, 'second');
    assert.equal(client.inFlight, 0);
    client.close();
  });

  test('显式指定 reqId', async () => {
    const client = makeClient();
    await connected(client);
    const p = client.call(30, 1, {}, 'my-req-1');
    await tick();
    assert.equal(FakeWebSocket.latest.lastRequest().reqId, 'my-req-1');
    FakeWebSocket.latest.emitMessage({ reqId: 'my-req-1', data: 'ok' });
    assert.equal((await p).data, 'ok');
    client.close();
  });

  test('旧服务无 reqId 回显 -> 回退配对最早在途请求', async () => {
    const client = makeClient();
    await connected(client);
    const p1 = client.call(30, 1, {});
    await tick();
    const p2 = client.call(30, 2, {});
    await tick();
    // 响应不带 reqId：应结算最早的那个
    FakeWebSocket.latest.emitMessage({ data: 'legacy-1' });
    assert.equal((await p1).data, 'legacy-1');
    assert.equal(client.inFlight, 1);
    FakeWebSocket.latest.emitMessage({ data: 'legacy-2' });
    assert.equal((await p2).data, 'legacy-2');
    assert.equal(client.inFlight, 0);
    client.close();
  });
});

describe('SDK 通知与错误分流', () => {
  test('kind=notification 走 onNotification（即使有在途请求）', async () => {
    const notifications: unknown[] = [];
    const client = makeClient({ onNotification: (m: unknown) => notifications.push(m) });
    await connected(client);
    const p = client.call(30, 1, {});
    await tick();
    FakeWebSocket.latest.emitMessage({ kind: 'notification', cmd: 100, subCmd: 1, data: { push: true } });
    assert.equal(notifications.length, 1);
    assert.equal(client.inFlight, 1, '推送不得吃掉在途请求');
    const id = FakeWebSocket.latest.lastRequest().reqId;
    FakeWebSocket.latest.emitMessage({ reqId: id, data: 'resp' });
    assert.equal((await p).data, 'resp');
    client.close();
  });

  test('无在途请求时，未知消息走 onNotification', async () => {
    const notifications: unknown[] = [];
    const client = makeClient({ onNotification: (m: unknown) => notifications.push(m) });
    await connected(client);
    FakeWebSocket.latest.emitMessage({ data: { push: 1 } });
    assert.equal(notifications.length, 1);
    client.close();
  });

  test('非法 JSON 不抛错', async () => {
    const client = makeClient();
    await connected(client);
    assert.doesNotThrow(() => FakeWebSocket.latest.emitMessage('{not json'));
    client.close();
  });
});

describe('SDK 超时、断线、重连', () => {
  test('单请求超时不影响其它在途请求', async () => {
    const client = makeClient({ requestTimeoutMs: 30 });
    await connected(client);
    const bad = client.call(30, 1, {});
    const good = client.call(30, 2, {});
    await tick();
    const [a, b] = FakeWebSocket.latest.requests();
    FakeWebSocket.latest.emitMessage({ reqId: b.reqId, data: 'ok' });
    assert.equal((await good).data, 'ok');
    await assert.rejects(() => bad, /请求超时/);
    assert.equal(client.inFlight, 0);
    client.close();
  });

  test('掉线后再次调用 -> 自动重连并重新带 token', async () => {
    let token = 'old';
    const client = makeClient({ getToken: () => token });
    await connected(client);
    assert.equal(FakeWebSocket.instances.length, 1);
    client.simulateDrop();
    await tick();
    assert.equal(client.connected, false);
    token = 'new';
    const promise = client.call(30, 1, {});
    await tick();
    assert.equal(FakeWebSocket.instances.length, 2, '应新建连接');
    FakeWebSocket.latest.emitOpen();
    await tick();
    assert.equal(FakeWebSocket.latest.lastRequest().data.__token, 'new');
    const id = FakeWebSocket.latest.lastRequest().reqId;
    FakeWebSocket.latest.emitMessage({ reqId: id, data: { success: true } });
    assert.deepEqual((await promise).data, { success: true });
    client.close();
  });

  test('断线后未决请求全部 reject', async () => {
    const client = makeClient();
    await connected(client);
    const p = client.call(30, 1, {});
    await tick();
    client.simulateDrop();
    await assert.rejects(() => p, /连接已断开/);
    client.close();
  });

  test('主动 close 后不再重连且未决请求被拒', async () => {
    const client = makeClient();
    await connected(client);
    const p = client.call(30, 1, {});
    await tick();
    client.close();
    await assert.rejects(() => p, /客户端已关闭/);
    assert.equal(client.connected, false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(FakeWebSocket.instances.length, 1, 'close() 后不得新建连接');
  });

  test('自动重连定时器：掉线后无需调用也会重建连接', async () => {
    const client = makeClient({ reconnectBaseDelayMs: 1, reconnectMaxDelayMs: 2 });
    await connected(client);
    assert.equal(FakeWebSocket.instances.length, 1);
    client.simulateDrop();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(FakeWebSocket.instances.length >= 2, '掉线后应自动新建连接');
    client.close();
  });
});

describe('SDK 握手鉴权头（任务 3 预留）', () => {
  test('提供 getAuthHeaders 时，构造 WebSocket 带 headers', async () => {
    const client = makeClient({ getAuthHeaders: () => ({ Authorization: 'Bearer abc' }) });
    await connected(client);
    assert.deepEqual(FakeWebSocket.latest.options, { headers: { Authorization: 'Bearer abc' } });
    client.close();
  });

  test('未提供 getAuthHeaders 时，不传第二个参数', async () => {
    const client = makeClient();
    await connected(client);
    assert.equal(FakeWebSocket.latest.options, undefined);
    client.close();
  });
});
