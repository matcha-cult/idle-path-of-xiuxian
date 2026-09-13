/**
 * OnlineSessionService 边界测试（P3.0 T2 / R2 §4.2）。
 *
 * 覆盖：在线定义的两条腿（活着的 WS 会话 + 页面可见）、心跳 TTL 的**恰好边界**、
 * 非法 userId、连接注册表与兜底口径的差异、去重、forget / sweep 的内存治理。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HEARTBEAT_TTL_MS,
  OnlineSessionService,
  type OnlineConnectionRegistry,
  type OnlineWsServerLike,
} from '../../../src/modules/online/online-session.service.js';

/** 可控连接注册表：模拟框架 `connectionRegistry`。 */
function fakeRegistry(initial: number[] = []): OnlineConnectionRegistry & { users: Set<string> } {
  const users = new Set(initial.map(String));
  return {
    users,
    isLocalUser: (userId: string) => users.has(userId),
    getLocalUserIds: () => [...users],
  };
}

function fakeWs(registry: OnlineConnectionRegistry): OnlineWsServerLike {
  return { connectionRegistry: registry };
}

describe('OnlineSessionService · 会话存活（无连接注册表 → 心跳 TTL 口径）', () => {
  test('从未 touch → 不在线', () => {
    const sessions = new OnlineSessionService();
    assert.equal(sessions.isOnline(7, 1_000), false);
  });

  test('touch 后 TTL 内在线；恰好等于 TTL 仍在线，TTL+1 离线（边界）', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 45_000 });
    sessions.touch(7, 1_000);
    assert.equal(sessions.isOnline(7, 1_000), true);
    assert.equal(sessions.isOnline(7, 1_000 + 45_000), true, '恰好等于 TTL 视为仍活');
    assert.equal(sessions.isOnline(7, 1_000 + 45_001), false, 'TTL+1 判死');
  });

  test('touch 刷新窗口（第二次心跳把判死点往后推）', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 1_000 });
    sessions.touch(7, 0);
    sessions.touch(7, 900);
    assert.equal(sessions.isOnline(7, 1_500), true);
    assert.equal(sessions.isOnline(7, 1_901), false);
  });

  test('非法 userId：0 / 负数 / NaN / Infinity 一律忽略（不污染登记表）', () => {
    const sessions = new OnlineSessionService();
    sessions.touch(0, 0);
    sessions.touch(-1, 0);
    sessions.touch(Number.NaN, 0);
    sessions.touch(Number.POSITIVE_INFINITY, 0);
    assert.equal(sessions.size, 0);
    assert.deepStrictEqual(sessions.onlineUserIds(0), []);
    assert.equal(sessions.isOnline(0, 0), false);
    assert.equal(sessions.isOnline(Number.NaN, 0), false);
  });

  test('小数 userId 截断为整数（驱动层返回字符串/浮点时不产生两套 key）', () => {
    const sessions = new OnlineSessionService();
    sessions.touch(7.9, 0);
    assert.equal(sessions.isOnline(7, 0), true);
    assert.equal(sessions.size, 1);
  });

  test('默认 TTL 是 45s（客户端 15s 心跳留 3 次容错）', () => {
    assert.equal(DEFAULT_HEARTBEAT_TTL_MS, 45_000);
    const sessions = new OnlineSessionService();
    sessions.touch(1, 0);
    assert.equal(sessions.isOnline(1, 45_000), true);
    assert.equal(sessions.isOnline(1, 45_001), false);
  });

  test('onlineUserIds：只收未判死的，且去重', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 1_000 });
    sessions.touch(1, 0);
    sessions.touch(2, 0);
    sessions.touch(3, 0);
    assert.deepStrictEqual(sessions.onlineUserIds(500).sort((a, b) => a - b), [1, 2, 3]);
    assert.deepStrictEqual(sessions.onlineUserIds(1_001), []);
  });
});

describe('OnlineSessionService · 页面可见（R2 §4.2 第二条腿）', () => {
  test('缺省可见：没上报过的客户端不被误判离线（老客户端 / e2e 客户端）', () => {
    const sessions = new OnlineSessionService();
    sessions.touch(7, 0);
    assert.equal(sessions.isVisible(7), true);
    assert.equal(sessions.isOnline(7, 0), true);
  });

  test('上报 hidden → 立即不算在线（即便会话还活着、心跳还新）', () => {
    const sessions = new OnlineSessionService();
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 10);
    assert.equal(sessions.isSessionAlive(7, 10), true);
    assert.equal(sessions.isOnline(7, 10), false);
    assert.deepStrictEqual(sessions.onlineUserIds(10), []);
  });

  test('hidden 上报本身不刷新活跃时刻（挂后台不会把窗口续上）', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 1_000 });
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 900);
    // 活跃时刻仍是 0：1_001 时已判死
    assert.equal(sessions.isSessionAlive(7, 1_000), true);
    assert.equal(sessions.isSessionAlive(7, 1_001), false);
  });

  test('切回前台：visible=true 同时刷新活跃时刻', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 1_000 });
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 500);
    sessions.setVisible(7, true, 900);
    assert.equal(sessions.isVisible(7), true);
    assert.equal(sessions.isOnline(7, 1_500), true);
  });

  test('非法 userId 的可见性上报被忽略', () => {
    const sessions = new OnlineSessionService();
    sessions.setVisible(0, false, 0);
    sessions.setVisible(-3, false, 0);
    assert.equal(sessions.isVisible(0), true);
    assert.equal(sessions.size, 0);
  });
});

describe('OnlineSessionService · 连接注册表口径（权威）', () => {
  test('注册表说活着即在线，无需 touch（框架心跳自己维护连接表）', () => {
    const registry = fakeRegistry([7]);
    const sessions = new OnlineSessionService(fakeWs(registry));
    assert.equal(sessions.isOnline(7, 0), true);
    assert.deepStrictEqual(sessions.onlineUserIds(0), [7]);
  });

  test('注册表说不在 → 即便刚 touch 过也算离线（断线立即停止推进）', () => {
    const registry = fakeRegistry([]);
    const sessions = new OnlineSessionService(fakeWs(registry));
    sessions.touch(7, 0);
    assert.equal(sessions.isSessionAlive(7, 0), false);
    assert.equal(sessions.isOnline(7, 0), false);
    assert.deepStrictEqual(sessions.onlineUserIds(0), []);
  });

  test('注册表 + 可见两条腿都要满足：可见位为 false 时在线列表为空', () => {
    const registry = fakeRegistry([7, 8]);
    const sessions = new OnlineSessionService(fakeWs(registry));
    sessions.setVisible(7, false, 0);
    assert.deepStrictEqual(sessions.onlineUserIds(0), [8]);
  });

  test('注册表返回重复 / 非法 userId：去重并过滤（同角色多会话只算一次）', () => {
    const registry: OnlineConnectionRegistry = {
      isLocalUser: () => true,
      getLocalUserIds: () => ['7', '7', '8', 'abc', '0', '-1', '', 'NaN'],
    };
    const sessions = new OnlineSessionService(fakeWs(registry));
    assert.deepStrictEqual(sessions.onlineUserIds(0).sort((a, b) => a - b), [7, 8]);
  });

  test('wsServer 为空对象（未启用 WS）→ 退回心跳 TTL 口径，而不是永远离线', () => {
    const sessions = new OnlineSessionService({});
    sessions.touch(7, 0);
    assert.equal(sessions.isOnline(7, 0), true);
  });
});

describe('OnlineSessionService · 内存治理', () => {
  test('forget：登出 / 会话结束时清掉登记（幂等）', () => {
    const sessions = new OnlineSessionService();
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 0);
    sessions.forget(7);
    sessions.forget(7);
    assert.equal(sessions.size, 0);
    assert.equal(sessions.isVisible(7), true, '清掉后回到「缺省可见」而不是永久隐藏');
  });

  test('sweep：只清超 TTL 的，返回清理条数', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 1_000 });
    sessions.touch(1, 0);
    sessions.touch(2, 900);
    sessions.touch(3, 1_100);
    assert.equal(sessions.sweep(1_500), 1);
    assert.equal(sessions.size, 2);
    assert.equal(sessions.sweep(1_500), 0, '幂等：没有可清的返回 0');
  });

  test('sweep 在 ttl=0 时把所有当前记录都清掉（边界）', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 0 });
    sessions.touch(1, 5);
    assert.equal(sessions.sweep(6), 1);
  });
});
