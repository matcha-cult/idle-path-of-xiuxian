import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HealthAction } from '../../src/ionet/health.action.js';
import { OnlineSessionService } from '../../src/modules/online/online-session.service.js';
import { NOTIFICATION_PORT } from '../../src/common/ports/notification.port.js';
import { flowContext } from '../helpers/flow.js';

describe('HealthAction 边界', () => {
  test('ping 返回 ok 且带服务名与时间戳', () => {
    const result = new HealthAction(new OnlineSessionService()).ping(flowContext({}));
    assert.equal(result.status, 'ok');
    assert.equal(result.service, 'idle-path-of-xiuxian');
    assert.ok(Number.isFinite(result.timestamp));
  });

  // P3.0 T2：system.ping 兼作在线会话登记的 touch 源
  test('已鉴权 ping → 登记该 userId 的在线会话', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 1_000 });
    new HealthAction(sessions).ping(flowContext({ userId: 42 }));
    assert.equal(sessions.isOnline(42, 500), true);
  });

  test('未鉴权 ping（userId=0n）→ 不登记任何会话', () => {
    const sessions = new OnlineSessionService(null, { heartbeatTtlMs: 1_000 });
    new HealthAction(sessions).ping(flowContext({}));
    assert.equal(sessions.size, 0);
    assert.deepStrictEqual(sessions.onlineUserIds(0), []);
  });
});

describe('NotificationPort 边界', () => {
  test('端口令牌为全局唯一 Symbol 且可描述', () => {
    assert.equal(typeof NOTIFICATION_PORT, 'symbol');
    assert.equal(String(NOTIFICATION_PORT), 'Symbol(NOTIFICATION_PORT)');
    assert.notEqual(NOTIFICATION_PORT, Symbol('NOTIFICATION_PORT'));
  });
});
