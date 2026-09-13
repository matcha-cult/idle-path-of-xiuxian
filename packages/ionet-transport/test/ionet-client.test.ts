/**
 * IonetClient 单元测试（T1/T2 验收）：
 * - 连接状态机 / `?token=` 握手 / 401 拒连；
 * - reqId 并发关联（乱序回包）与 serial 兜底；
 * - 业务失败（data.success===false）与传输层 errorCode 的分层判定；
 * - 应用层心跳 system.ping (1,1) 与超时判死；
 * - 退避重连与 maxAttempts；
 * - visibilitychange / online-offline 生命周期；
 * - 推送（kind='notification'）与请求配对互不干扰。
 */
import { describe, expect, it } from 'vitest';
import { IonetClient, withToken } from '../src/client/ionet-client.js';
import {
  BusinessError,
  ConnectionError,
  HandshakeError,
  RequestTimeoutError,
  TransportError,
} from '../src/client/errors.js';
import type { LifecycleAdapter } from '../src/client/lifecycle.js';
import type { NotificationMessage } from '@nbb-ionet/client-protocol';
import { businessFail, businessOk } from '../src/testing/memory-ionet-server.js';
import { createHarness, sleep, waitFor } from './helpers/harness.js';

const PING_DATA = { status: 'ok', service: 'idle-path-of-xiuxian', timestamp: 123 };

/** 可控生命周期事件源。 */
class TestLifecycle implements LifecycleAdapter {
  private readonly visibility = new Set<(hidden: boolean) => void>();
  private readonly online = new Set<() => void>();
  private readonly offline = new Set<() => void>();
  hidden = false;

  onVisibilityChange(handler: (hidden: boolean) => void): () => void {
    this.visibility.add(handler);
    return () => this.visibility.delete(handler);
  }
  onOnline(handler: () => void): () => void {
    this.online.add(handler);
    return () => this.online.delete(handler);
  }
  onOffline(handler: () => void): () => void {
    this.offline.add(handler);
    return () => this.offline.delete(handler);
  }
  isHidden(): boolean {
    return this.hidden;
  }
  emitHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const handler of this.visibility) handler(hidden);
  }
  emitOnline(): void {
    this.hidden = false;
    for (const handler of this.online) handler();
  }
  emitOffline(): void {
    for (const handler of this.offline) handler();
  }
}

const NO_RECONNECT = { enabled: false } as const;

describe('IonetClient · 连接与握手', () => {
  it('connect() 成功后 state=online，system.ping (1,1) 往返成功', async () => {
    const harness = createHarness((req) =>
      req.cmd === 1 && req.subCmd === 1 ? { data: PING_DATA } : { data: businessOk({}) },
    );
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    expect(client.getState()).toBe('online');

    const response = await client.requestEnvelope(1, 1, {});
    expect(response.data).toEqual(PING_DATA);
    expect(response.errorCode).toBeUndefined();
    // 默认 reqId 并发：请求带 reqId → 响应回显 reqId 且 kind='response'（PROTOCOL.md §4）
    expect(response.reqId).toBeTypeOf('string');
    expect(response.kind).toBe('response');
    client.close();
  });

  it('authHandler 提供 token 时握手 URL 拼 ?token=；无 token 时不拼', async () => {
    const harness = createHarness(() => ({ data: PING_DATA }));
    const client = new IonetClient({
      url: 'ws://test/ws?a=1',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
      authHandler: () => 'jwt.token/值',
    });
    await client.connect();
    expect(harness.handshakeUrls()[0]).toBe('ws://test/ws?a=1&token=jwt.token%2F%E5%80%BC');
    client.close();

    const harness2 = createHarness(() => ({ data: PING_DATA }));
    const client2 = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness2.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client2.connect();
    expect(harness2.handshakeUrls()[0]).toBe('ws://test/ws');
    client2.close();
  });

  it('未 open 即 close（模拟服务端 401 拒绝升级）→ connect reject HandshakeError 且 state=failed', async () => {
    const harness = createHarness(() => null, { closeOnConnect: { code: 1006, reason: 'unauthorized' } });
    const rejections: HandshakeError[] = [];
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
      onHandshakeRejected: (error) => rejections.push(error),
    });
    await expect(client.connect()).rejects.toBeInstanceOf(HandshakeError);
    expect(client.getState()).toBe('failed');
    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.message).toContain('握手被拒');
    // 无 token 的提示文案（PROTOCOL.md §6）
    expect(rejections[0]?.message).toContain('token');
  });

  it('close() 后 state=closed，后续 request 抛 ConnectionError', async () => {
    const harness = createHarness(() => ({ data: businessOk({}) }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    client.close();
    expect(client.getState()).toBe('closed');
    await expect(client.request(30, 1, {})).rejects.toBeInstanceOf(ConnectionError);
  });

  it('idle 状态直接 request → ConnectionError（连接不可用）', async () => {
    const harness = createHarness(() => null);
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await expect(client.request(30, 1, {})).rejects.toBeInstanceOf(ConnectionError);
  });
});

describe('IonetClient · reqId 并发关联', () => {
  it('并发请求乱序回包也能精确配对（慢的慢、快的快）', async () => {
    const harness = createHarness((req) => {
      if (req.cmd === 30) return { data: businessOk({ tag: 'slow' }), delayMs: 60 };
      if (req.cmd === 80) return { data: businessOk({ tag: 'fast' }), delayMs: 5 };
      return { data: businessOk({ tag: 'other' }) };
    });
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();

    const slow = client.request<{ tag: string }>(30, 1, {});
    const fast = client.request<{ tag: string }>(80, 1, {});
    await waitFor(() => client.inFlight === 2, { label: '两个并发在途' });

    const fastResult = await fast;
    expect(fastResult.data?.tag).toBe('fast');
    const slowResult = await slow;
    expect(slowResult.data?.tag).toBe('slow');
    expect(client.inFlight).toBe(0);

    // 两个请求的 reqId 必须互不相同
    const reqIds = harness.adapter().sentFrames().map((f) => f['reqId']);
    expect(new Set(reqIds).size).toBe(2);
    client.close();
  });

  it('服务端不回显 reqId（旧协议）时仍能凭 FIFO 配对', async () => {
    // echoReqId=false 模拟旧服务：请求带 reqId，但响应不含 reqId/kind（PROTOCOL.md §12.1）
    const harness = createHarness(() => ({ data: businessOk({ ok: 1 }) }), {}, { echoReqId: false });
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    const response = await client.requestEnvelope(30, 1, {});
    expect(response.reqId).toBeUndefined();
    expect(response.kind).toBeUndefined();
    expect(response.data).toEqual(businessOk({ ok: 1 }));
    client.close();
  });

  it("correlation='serial' 时请求帧不含 reqId，且并发被串行化", async () => {
    const order: number[] = [];
    const harness = createHarness((req) => {
      order.push(req.subCmd);
      return req.subCmd === 1
        ? { data: businessOk({ n: 1 }), delayMs: 40 }
        : { data: businessOk({ n: 2 }) };
    });
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
      correlation: 'serial',
    });
    await client.connect();
    const first = client.request(30, 1, {});
    const second = client.request(30, 2, {});
    await Promise.all([first, second]);
    // 第二个请求必须等第一个响应回来之后才发出
    expect(order).toEqual([1, 2]);
    for (const frame of harness.adapter().sentFrames()) {
      expect(frame['reqId']).toBeUndefined();
    }
    client.close();
  });
});

describe('IonetClient · 错误分层（06 §2）', () => {
  it('errorCode=404 → TransportError（传输层失败优先于业务层）', async () => {
    const harness = createHarness(() => ({ errorCode: 404, errorMessage: 'Action 未注册' }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    const error = await client.request(99, 9, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).errorCode).toBe(404);
    client.close();
  });

  it('errorCode=0 且 data.success===false → BusinessError（业务主路径）并触发回调', async () => {
    const harness = createHarness(() => ({ data: businessFail('ITEM_NOT_FOUND', '物品不存在') }));
    const seen: BusinessError[] = [];
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
      onBusinessError: (error) => seen.push(error),
    });
    await client.connect();
    const error = await client.request(30, 2, { id: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe('ITEM_NOT_FOUND');
    expect((error as BusinessError).message).toBe('物品不存在');
    expect(seen).toHaveLength(1);
    client.close();
  });

  it('allowBusinessFailure=true 时业务失败体原样返回，不抛错', async () => {
    const harness = createHarness(() => ({ data: businessFail('CHALLENGE_FAILED', '挑战失败') }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    const body = await client.request(100, 4, {}, { allowBusinessFailure: true });
    expect(body.success).toBe(false);
    expect(body.message).toBe('挑战失败');
    client.close();
  });

  it('业务码缺失 → BusinessError.code=UNKNOWN', async () => {
    const harness = createHarness(() => ({ data: { success: false, message: '没有 data.code' } }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    const error = await client.request(30, 1, {}).catch((e: unknown) => e);
    expect((error as BusinessError).code).toBe('UNKNOWN');
    client.close();
  });

  it('边界：data 存在但无 success 字段 / system.ping 裸对象 → 均视为成功', async () => {
    const harness = createHarness((req) =>
      req.cmd === 1 ? { data: PING_DATA } : { data: { total: 0 } },
    );
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    await expect(client.request(1, 1, {})).resolves.toBeDefined();
    await expect(client.request(30, 3, {})).resolves.toEqual({ total: 0 });
    client.close();
  });

  it('请求超时（服务端不回包）→ RequestTimeoutError', async () => {
    const harness = createHarness(() => null);
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
      requestTimeoutMs: 25,
    });
    await client.connect();
    const error = await client.request(30, 1, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(client.inFlight).toBe(0);
    client.close();
  });

  it('坏帧（非 JSON）不崩溃，其后请求仍可用', async () => {
    const harness = createHarness(() => ({ data: businessOk({ ok: true }) }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    harness.adapter().emitRaw('{ this is not json');
    harness.adapter().emitRaw('42');
    const body = await client.request(30, 1, {});
    expect(body.success).toBe(true);
    client.close();
  });
});

describe('IonetClient · 推送', () => {
  it("kind='notification' 走 onNotification，不与在途请求抢配对", async () => {
    const harness = createHarness(() => ({ data: businessOk({ n: 1 }), delayMs: 20 }));
    const notifications: NotificationMessage[] = [];
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
      onNotification: (n) => notifications.push(n),
    });
    await client.connect();
    const pending = client.request(30, 1, {});
    harness.server().push({ cmd: 130, subCmd: 1, data: { tick: 1 }, timestamp: 1 });
    const body = await pending;
    expect(body.data).toEqual({ n: 1 });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.cmd).toBe(130);
    client.close();
  });
});

describe('IonetClient · 心跳 system.ping (1,1)', () => {
  it('按间隔发送 (1,1) 并累计 ack', async () => {
    const harness = createHarness((req) =>
      req.cmd === 1 && req.subCmd === 1 ? { data: PING_DATA } : { data: businessOk({}) },
    );
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: { intervalMs: 15, timeoutMs: 500 },
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    await waitFor(() => client.heartbeatAcks >= 2, { label: '心跳 ack>=2', timeoutMs: 500 });
    expect(client.lastHeartbeatAckAt).not.toBeNull();
    client.close();
  });

  it('心跳超时（>timeoutMs 无响应）判定死链并强制重连', async () => {
    let respondToPing = false;
    const harness = createHarness((req) =>
      req.cmd === 1 && req.subCmd === 1 ? (respondToPing ? { data: PING_DATA } : null) : { data: businessOk({}) },
    );
    const states: string[] = [];
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: { intervalMs: 15, timeoutMs: 20 },
      reconnect: { enabled: true, baseDelayMs: 5, maxDelayMs: 10, jitterRatio: 0 },
      onStateChange: (state) => states.push(state),
    });
    await client.connect();
    respondToPing = false;
    await waitFor(() => client.getState() === 'reconnecting', { label: '心跳判死→重连中', timeoutMs: 800 });
    respondToPing = true;
    await waitFor(() => client.getState() === 'online' && harness.adapters.length >= 2, {
      label: '重连成功',
      timeoutMs: 800,
    });
    expect(states).toContain('reconnecting');
    client.close();
  });
});

describe('IonetClient · 退避重连', () => {
  it('服务端 drop 后自动重连（新建适配器）并恢复 online', async () => {
    const harness = createHarness((req) =>
      req.cmd === 1 ? { data: PING_DATA } : { data: businessOk({}) },
    );
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: { enabled: true, baseDelayMs: 5, maxDelayMs: 10, jitterRatio: 0 },
    });
    await client.connect();
    const pending = client.request(30, 1, {});
    harness.server().drop();
    await expect(pending).rejects.toBeInstanceOf(ConnectionError);
    await waitFor(() => client.getState() === 'online' && harness.adapters.length === 2, {
      label: '重连成功',
      timeoutMs: 800,
    });
    await expect(client.request(30, 1, {})).resolves.toBeDefined();
    client.close();
  });

  it('maxAttempts 用尽 → state=failed', async () => {
    const harness = createHarness(() => null, { closeOnConnect: { code: 1006, reason: 'nope' } });
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: {
        enabled: true,
        baseDelayMs: 1,
        maxDelayMs: 2,
        jitterRatio: 0,
        maxAttempts: 2,
        reconnectOnHandshakeFailure: true,
      },
    });
    await expect(client.connect()).rejects.toBeInstanceOf(HandshakeError);
    await waitFor(() => client.getState() === 'failed', { label: 'failed', timeoutMs: 800 });
    expect(harness.adapters.length).toBe(3); // 首次 + 2 次重连
  });

  it('reconnect.enabled=false → drop 后 state=failed', async () => {
    const harness = createHarness(() => ({ data: businessOk({}) }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: NO_RECONNECT,
    });
    await client.connect();
    harness.server().drop();
    await waitFor(() => client.getState() === 'failed', { label: 'failed', timeoutMs: 300 });
  });
});

describe('IonetClient · 生命周期感知', () => {
  it('页面隐藏 → 主动断开 offline；恢复可见 → 重连 online', async () => {
    const lifecycle = new TestLifecycle();
    const harness = createHarness(() => ({ data: businessOk({}) }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: { enabled: true, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 },
      lifecycle,
    });
    await client.connect();
    lifecycle.emitHidden(true);
    await waitFor(() => client.getState() === 'offline', { label: 'offline', timeoutMs: 300 });
    expect(harness.adapter().closeCalls.length).toBeGreaterThan(0);

    lifecycle.emitHidden(false);
    await waitFor(() => client.getState() === 'online', { label: '恢复 online', timeoutMs: 500 });
    expect(harness.adapters.length).toBe(2);
    client.close();
  });

  it('navigator offline → 主动断开；online → 重连', async () => {
    const lifecycle = new TestLifecycle();
    const harness = createHarness(() => ({ data: businessOk({}) }));
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: { enabled: true, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 },
      lifecycle,
    });
    await client.connect();
    lifecycle.emitOffline();
    await waitFor(() => client.getState() === 'offline', { label: 'offline', timeoutMs: 300 });
    lifecycle.emitOnline();
    await waitFor(() => client.getState() === 'online', { label: '恢复 online', timeoutMs: 500 });
    client.close();
  });

  it('重连时重新调用 authHandler 取最新 token（token 轮换）', async () => {
    const lifecycle = new TestLifecycle();
    const harness = createHarness(() => ({ data: businessOk({}) }));
    let token = 'old-token';
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: { enabled: true, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 },
      lifecycle,
      authHandler: () => token,
    });
    await client.connect();
    expect(harness.handshakeUrls()[0]).toContain('token=old-token');
    token = 'new-token';
    lifecycle.emitHidden(true);
    await waitFor(() => client.getState() === 'offline', { label: 'offline', timeoutMs: 300 });
    lifecycle.emitHidden(false);
    await waitFor(() => harness.adapters.length === 2, { label: '重连', timeoutMs: 500 });
    expect(harness.handshakeUrls()[1]).toContain('token=new-token');
    client.close();
  });
});

describe('withToken 边界', () => {
  it('undefined / 空串 不追加；已有 query 用 &；特殊字符编码', () => {
    expect(withToken('ws://h/ws', undefined)).toBe('ws://h/ws');
    expect(withToken('ws://h/ws', '')).toBe('ws://h/ws');
    expect(withToken('ws://h/ws', 'abc')).toBe('ws://h/ws?token=abc');
    expect(withToken('ws://h/ws?x=1', 'abc')).toBe('ws://h/ws?x=1&token=abc');
    expect(withToken('ws://h/ws', 'a b&c')).toBe('ws://h/ws?token=a%20b%26c');
  });
});
