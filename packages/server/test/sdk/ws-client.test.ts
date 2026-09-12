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
    reconnectBaseDelayMs: 1,
    reconnectMaxDelayMs: 2,
    ...overrides,
  });
}

async function connected(client: WarWsClient): Promise<void> {
  const promise = client.connect();
  await tick();
  FakeWebSocket.latest.emitOpen();
  await promise;
}

describe('WarWsClient 连接与信封 边界', () => {
  test('open 前 connected=false，open 后 true', async () => {
    const client = makeClient();
    const promise = client.connect();
    await tick();
    assert.equal(client.connected, false);
    FakeWebSocket.latest.emitOpen();
    await promise;
    assert.equal(client.connected, true);
    client.close();
  });

  test('请求信封为 { cmd, subCmd, data }，并注入 __token', async () => {
    const client = makeClient({ getToken: () => 'tk' });
    await connected(client);
    const promise = client.call(30, 1, { page: 2 });
    await tick();
    const req = FakeWebSocket.latest.lastRequest();
    assert.deepEqual(req, { cmd: 30, subCmd: 1, data: { page: 2, __token: 'tk' } });
    FakeWebSocket.latest.emitMessage({ data: { success: true } });
    assert.deepEqual(await promise, { data: { success: true } });
    client.close();
  });

  test('无 token 时不注入 __token', async () => {
    const client = makeClient({ getToken: () => undefined });
    await connected(client);
    const promise = client.call(1, 1, {});
    await tick();
    assert.equal('__token' in FakeWebSocket.latest.lastRequest().data, false);
    FakeWebSocket.latest.emitMessage({ data: {} });
    await promise;
    client.close();
  });

  test('每次请求都重新取 token（重连后可用新 token）', async () => {
    let token = 't1';
    const client = makeClient({ getToken: () => token });
    await connected(client);
    const p1 = client.call(30, 1, {});
    await tick();
    assert.equal(FakeWebSocket.latest.lastRequest().data.__token, 't1');
    FakeWebSocket.latest.emitMessage({ data: {} });
    await p1;
    token = 't2';
    const p2 = client.call(30, 1, {});
    await tick();
    assert.equal(FakeWebSocket.latest.lastRequest().data.__token, 't2');
    FakeWebSocket.latest.emitMessage({ data: {} });
    await p2;
    client.close();
  });
});

describe('WarWsClient 串行队列 边界', () => {
  test('前一个未响应时，后一个不发出（串行）', async () => {
    const client = makeClient();
    await connected(client);
    const p1 = client.call(30, 1, { n: 1 });
    await tick();
    const p2 = client.call(30, 2, { n: 2 });
    await tick();
    assert.equal(FakeWebSocket.latest.sent.length, 1, '第二个请求必须排队');

    FakeWebSocket.latest.emitMessage({ data: { n: 1 } });
    assert.deepEqual(await p1, { data: { n: 1 } });
    await tick();
    assert.equal(FakeWebSocket.latest.sent.length, 2, '第一个响应后才发第二个');
    assert.equal(FakeWebSocket.latest.lastRequest().subCmd, 2);

    FakeWebSocket.latest.emitMessage({ data: { n: 2 } });
    assert.deepEqual(await p2, { data: { n: 2 } });
    client.close();
  });

  test('乱序响应也按顺序配对（无 requestId 的既有约束）', async () => {
    const client = makeClient();
    await connected(client);
    const p1 = client.call(30, 1, {});
    await tick();
    const p2 = client.call(30, 2, {});
    FakeWebSocket.latest.emitMessage({ data: 'first' });
    await tick();
    FakeWebSocket.latest.emitMessage({ data: 'second' });
    assert.deepEqual(await p1, { data: 'first' });
    assert.deepEqual(await p2, { data: 'second' });
    client.close();
  });
});

describe('WarWsClient 超时与重连 边界', () => {
  test('请求超时 -> reject', async () => {
    const client = makeClient({ requestTimeoutMs: 30 });
    await connected(client);
    await assert.rejects(() => client.call(30, 1, {}), /请求超时/);
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
    FakeWebSocket.latest.emitMessage({ data: { success: true } });
    assert.deepEqual(await promise, { data: { success: true } });
    client.close();
  });

  test('主动 close 后不再重连', async () => {
    const client = makeClient();
    await connected(client);
    client.close();
    assert.equal(client.connected, false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(FakeWebSocket.instances.length, 1, 'close() 后不得新建连接');
  });

  test('无在途请求时的消息走 onNotification', async () => {
    const notifications: unknown[] = [];
    const client = makeClient({ onNotification: (m: unknown) => notifications.push(m) });
    await connected(client);
    FakeWebSocket.latest.emitMessage({ cmd: 1, subCmd: 1, data: { push: true } });
    assert.equal(notifications.length, 1);
    client.close();
  });

  test('非法 JSON 消息不抛错', async () => {
    const client = makeClient();
    await connected(client);
    assert.doesNotThrow(() => FakeWebSocket.latest.emitMessage('{not json'));
    client.close();
  });
});
