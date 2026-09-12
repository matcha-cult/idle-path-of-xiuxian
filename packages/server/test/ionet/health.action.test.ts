import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HealthAction } from '../../src/ionet/health.action.js';
import { NOTIFICATION_PORT } from '../../src/common/ports/notification.port.js';

describe('HealthAction 边界', () => {
  test('ping 返回 ok 且带服务名与时间戳', () => {
    const result = new HealthAction().ping();
    assert.equal(result.status, 'ok');
    assert.equal(result.service, 'idle-path-of-xiuxian');
    assert.ok(Number.isFinite(result.timestamp));
  });
});

describe('NotificationPort 边界', () => {
  test('端口令牌为全局唯一 Symbol 且可描述', () => {
    assert.equal(typeof NOTIFICATION_PORT, 'symbol');
    assert.equal(String(NOTIFICATION_PORT), 'Symbol(NOTIFICATION_PORT)');
    assert.notEqual(NOTIFICATION_PORT, Symbol('NOTIFICATION_PORT'));
  });
});
