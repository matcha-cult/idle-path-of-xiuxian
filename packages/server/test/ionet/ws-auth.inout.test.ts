import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WsAuthInOut, WS_TOKEN_FIELD } from '../../src/ionet/ws-auth.inout.js';
import { cmdMerge, ITEM_CMD, SYSTEM_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';

function makeInOut(verify: (token: string) => { valid: boolean; decoded?: { id: number; username: string } }): WsAuthInOut {
  return new WsAuthInOut({ verifyToken: verify } as never);
}

const okVerify = (token: string) =>
  token === 'good' ? { valid: true, decoded: { id: 42, username: 'u' } } : { valid: false };

describe('WsAuthInOut 边界', () => {
  test('受保护 Action + 合法 token -> 绑定 userId', () => {
    const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: ITEM_CMD.inventory, data: { [WS_TOKEN_FIELD]: 'good' } });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(ctx.getUserId(), 42n);
  });

  test('受保护 Action + 非法 token -> 不绑定', () => {
    const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: ITEM_CMD.inventory, data: { [WS_TOKEN_FIELD]: 'bad' } });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(ctx.getUserId(), 0n);
  });

  test('受保护 Action + 缺失 token -> 不绑定', () => {
    const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: ITEM_CMD.inventory, data: {} });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(ctx.getUserId(), 0n);
  });

  test('token 非字符串 -> 不绑定且不抛错', () => {
    for (const token of [123, null, {}, [], true]) {
      const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: ITEM_CMD.inventory, data: { [WS_TOKEN_FIELD]: token } });
      makeInOut(okVerify).fuckIn(ctx);
      assert.equal(ctx.getUserId(), 0n);
    }
  });

  test('空串 token -> 视为缺失', () => {
    const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: ITEM_CMD.inventory, data: { [WS_TOKEN_FIELD]: '' } });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(ctx.getUserId(), 0n);
  });

  test('data 非对象 -> 不抛错、不绑定', () => {
    for (const data of [undefined, null, 'str', 5]) {
      const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: ITEM_CMD.inventory, data });
      makeInOut(okVerify).fuckIn(ctx);
      assert.equal(ctx.getUserId(), 0n);
    }
  });

  test('白名单 Action 免鉴权（即使带非法 token）', () => {
    const ctx = flowContext({ cmd: SYSTEM_CMD.cmd, subCmd: SYSTEM_CMD.ping, data: { [WS_TOKEN_FIELD]: 'bad' } });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(ctx.getUserId(), 0n);
  });

  test('读取后剥离 __token（不进业务层）', () => {
    const data: Record<string, unknown> = { [WS_TOKEN_FIELD]: 'good', keep: 1 };
    const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: ITEM_CMD.inventory, data });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(WS_TOKEN_FIELD in data, false);
    assert.equal(data.keep, 1);
    assert.equal(ctx.getUserId(), 42n);
  });

  test('白名单 Action 同样剥离 __token', () => {
    const data: Record<string, unknown> = { [WS_TOKEN_FIELD]: 'good' };
    const ctx = flowContext({ cmd: SYSTEM_CMD.cmd, subCmd: SYSTEM_CMD.ping, data });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(WS_TOKEN_FIELD in data, false);
  });

  test('未知路由（非白名单）按受保护处理', () => {
    const ctx = flowContext({ cmd: 999, subCmd: 9, data: {} });
    makeInOut(okVerify).fuckIn(ctx);
    assert.equal(ctx.getUserId(), 0n);
    assert.equal(cmdMerge(999, 9) === cmdMerge(SYSTEM_CMD.cmd, SYSTEM_CMD.ping), false);
  });

  test('fuckOut 无副作用', () => {
    const ctx = flowContext({ cmd: ITEM_CMD.cmd, subCmd: 1, data: {} });
    assert.doesNotThrow(() => makeInOut(okVerify).fuckOut(ctx));
  });
});
