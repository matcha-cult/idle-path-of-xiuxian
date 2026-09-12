import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EdgeService, type EdgeWsServer } from '../../src/modules/edge/edge.service.js';
import { stub } from '../helpers/stub.js';

const MSG = { cmd: 100, subCmd: 1, data: { a: 1 } };
/** 出站信封：实现会补 kind 判别字段，供客户端与响应区分 */
const WIRE = { kind: 'notification', cmd: 100, subCmd: 1, data: { a: 1 } };

function makeWs(clientCount = 0, sendResult = true) {
  const broadcast = stub<[unknown], void>();
  const sendTo = stub<[bigint, unknown], boolean>(() => sendResult);
  const ws: EdgeWsServer = { broadcast, sendTo, clientCount };
  return { ws, broadcast, sendTo };
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

describe('EdgeService wsServer 存在边界', () => {
  test('出站信封一律带 kind=notification（任务 2 判别契约）', () => {
    const { ws, broadcast, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    svc.broadcast(MSG);
    svc.sendTo(1, MSG);
    assert.equal((broadcast.last?.[0] as { kind?: string }).kind, 'notification');
    assert.equal((sendTo.last?.[1] as { kind?: string }).kind, 'notification');
  });

  test('broadcast 补 kind=notification 后透传（内容与入参一致，另加判别字段）', () => {
    const { ws, broadcast } = makeWs();
    const svc = new EdgeService(ws);
    assert.equal(svc.broadcast(MSG), undefined);
    assert.equal(broadcast.callCount, 1);
    assert.deepEqual(broadcast.last, [WIRE]);
  });

  test('broadcast 重复调用透传次数累加', () => {
    const { ws, broadcast } = makeWs();
    const svc = new EdgeService(ws);
    svc.broadcast(MSG);
    svc.broadcast(MSG);
    assert.equal(broadcast.callCount, 2);
  });

  test('sendTo(userId) 以 BigInt(userId) 调用 ws.sendTo 并返回其返回值 true', () => {
    const { ws, sendTo } = makeWs(0, true);
    const svc = new EdgeService(ws);
    assert.equal(svc.sendTo(7, MSG), true);
    assert.equal(sendTo.callCount, 1);
    assert.deepEqual(sendTo.last, [7n, WIRE]);
  });

  test('sendTo 返回 wsServer 的 false', () => {
    const { ws, sendTo } = makeWs(0, false);
    const svc = new EdgeService(ws);
    assert.equal(svc.sendTo(7, MSG), false);
    assert.equal(sendTo.callCount, 1);
  });

  test('sendTo(0) -> 0n', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo(0, MSG);
    assert.equal(sendTo.last?.[0], 0n);
  });

  test('sendTo(-3) -> -3n', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo(-3, MSG);
    assert.equal(sendTo.last?.[0], -3n);
  });

  test('sendTo(Number.MAX_SAFE_INTEGER) -> BigInt 透传', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo(Number.MAX_SAFE_INTEGER, MSG);
    assert.equal(sendTo.last?.[0], BigInt(Number.MAX_SAFE_INTEGER));
  });

  test('sendTo(1.5) -> BigInt 转换抛 RangeError，ws 不被调用', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo(1.5, MSG), RangeError);
    assert.equal(sendTo.callCount, 0);
  });

  test('sendTo(NaN) -> RangeError', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo(Number.NaN, MSG), RangeError);
    assert.equal(sendTo.callCount, 0);
  });

  test('sendTo(Infinity) -> RangeError', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo(Number.POSITIVE_INFINITY, MSG), RangeError);
    assert.equal(sendTo.callCount, 0);
  });

  test('sendTo 数字字符串（BigInt 可解析）-> 透传对应 bigint', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    svc.sendTo('123' as never, MSG);
    assert.equal(sendTo.last?.[0], 123n);
  });

  test('sendTo 非数字字符串 -> SyntaxError', () => {
    const { ws, sendTo } = makeWs();
    const svc = new EdgeService(ws);
    assert.throws(() => svc.sendTo('abc' as never, MSG), SyntaxError);
    assert.equal(sendTo.callCount, 0);
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
