import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EdgeService, type EdgeWsServer } from '../../src/modules/edge/edge.service.js';
import { stub } from '../helpers/stub.js';

const MSG = { cmd: 100, subCmd: 1, data: { a: 1 } };

function makeWs(clientCount = 0, sendResult = true) {
  const broadcastNotification = stub<[unknown], void>();
  const sendNotification = stub<[bigint, unknown], boolean>(() => sendResult);
  const ws: EdgeWsServer = { broadcastNotification, sendNotification, clientCount };
  return { ws, broadcastNotification, sendNotification };
}

describe('EdgeService wsServer 为 null 边界', () => {
  test('broadcast 不抛错（丢弃）', () => {
    const svc = new EdgeService(null);
    assert.doesNotThrow(() => svc.broadcast(MSG));
  });

  test('broadcast(null) 也不抛错', () => {
    const svc = new EdgeService(null);
    assert.doesNotThrow(() => svc.broadcast(null as never));
  });

  test('sendTo 返回 false', () => {
    const svc = new EdgeService(null);
    assert.equal(svc.sendTo(7, MSG), false);
  });

  test('sendTo(0) 返回 false', () => {
    const svc = new EdgeService(null);
    assert.equal(svc.sendTo(0, MSG), false);
  });

  test('connectionCount 为 0', () => {
    const svc = new EdgeService(null);
    assert.equal(svc.connectionCount, 0);
  });
});

describe('EdgeService wsServer 存在（框架规范化推送入口）', () => {
  test('broadcast 原样透传给 broadcastNotification，不补信封字段（kind 由框架 createNotificationMessage 统一构造）', () => {
    const { ws, broadcastNotification } = makeWs();
    const svc = new EdgeService(ws);
    assert.equal(svc.broadcast(MSG), undefined);
    assert.equal(broadcastNotification.callCount, 1);
    assert.deepEqual(broadcastNotification.last, [MSG]);
  });

  test('broadcast 消息不含 kind / timestamp（业务不自造形状）', () => {
    const { ws, broadcastNotification } = makeWs();
    const svc = new EdgeService(ws);
    svc.broadcast(MSG);
    const delivered = broadcastNotification.last?.[0] as Record<string, unknown>;
    assert.equal('kind' in delivered, false);
    assert.equal('timestamp' in delivered, false);
    assert.deepEqual(delivered, MSG);
  });

  test('broadcast 重复调用透传次数累加', () => {
    const { ws, broadcastNotification } = makeWs();
    const svc = new EdgeService(ws);
    svc.broadcast(MSG);
    svc.broadcast(MSG);
    assert.equal(broadcastNotification.callCount, 2);
  });

  test('sendTo(userId) 以 BigInt(userId) 调用 ws.sendNotification 并返回其返回值 true', () => {
    const { ws, sendNotification } = makeWs(0, true);
    const svc = new EdgeService(ws);
    assert.equal(svc.sendTo(7, MSG), true);
    assert.equal(sendNotification.callCount, 1);
    assert.deepEqual(sendNotification.last, [7n, MSG]);
  });

  test('sendTo 消息原样透传（不含 kind）', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo(7, MSG);
    const delivered = sendNotification.last?.[1] as Record<string, unknown>;
    assert.equal('kind' in delivered, false);
    assert.deepEqual(delivered, MSG);
  });

  test('sendTo 返回 wsServer 的 false', () => {
    const { ws, sendNotification } = makeWs(0, false);
    const svc = new EdgeService(ws);
    assert.equal(svc.sendTo(7, MSG), false);
    assert.equal(sendNotification.callCount, 1);
  });

  test('sendTo(0) -> 0n', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo(0, MSG);
    assert.equal(sendNotification.last?.[0], 0n);
  });

  test('sendTo(-3) -> -3n', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo(-3, MSG);
    assert.equal(sendNotification.last?.[0], -3n);
  });

  test('sendTo(Number.MAX_SAFE_INTEGER) -> BigInt 透传', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo(Number.MAX_SAFE_INTEGER, MSG);
    assert.equal(sendNotification.last?.[0], BigInt(Number.MAX_SAFE_INTEGER));
  });

  test('sendTo(1.5) -> BigInt 转换抛 RangeError，ws 不被调用', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo(1.5, MSG), RangeError);
    assert.equal(sendNotification.callCount, 0);
  });

  test('sendTo(NaN) -> RangeError', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo(Number.NaN, MSG), RangeError);
    assert.equal(sendNotification.callCount, 0);
  });

  test('sendTo(Infinity) -> RangeError', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo(Number.POSITIVE_INFINITY, MSG), RangeError);
    assert.equal(sendNotification.callCount, 0);
  });

  test('sendTo 数字字符串（BigInt 可解析）-> 透传对应 bigint', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo('123' as never, MSG);
    assert.equal(sendNotification.last?.[0], 123n);
  });

  test('sendTo 非数字字符串 -> SyntaxError', () => {
    const { ws, sendNotification } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo('abc' as never, MSG), SyntaxError);
    assert.equal(sendNotification.callCount, 0);
  });

  test('connectionCount 返回 clientCount 实际值（0）', () => {
    const { ws } = makeWs(0);
    assert.equal(new EdgeService(ws).connectionCount, 0);
  });

  test('connectionCount 返回 clientCount 实际值（7）', () => {
    const { ws } = makeWs(7);
    assert.equal(new EdgeService(ws).connectionCount, 7);
  });
});