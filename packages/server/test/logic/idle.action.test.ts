import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IdleAction } from '../../src/modules/logic/idle/idle.action.js';
import { IDLE_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：IdleAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 idle.logic.service 测试覆盖。

function makeAction(): { action: IdleAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    status: stub(() => 'STATUS'),
    settle: stub(() => 'SETTLE'),
  };
  return { action: new IdleAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: IDLE_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: IdleAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['status', (a, d) => a.status(flowContext({ cmd: IDLE_CMD.cmd, subCmd: IDLE_CMD.status }), d)],
  ['settle', (a, d) => a.settle(flowContext({ cmd: IDLE_CMD.cmd, subCmd: IDLE_CMD.settle }), d)],
];

describe('IdleAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.settle(flowContext({ userId: 0, cmd: IDLE_CMD.cmd, subCmd: IDLE_CMD.settle }), {});
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.settle.callCount, 0);
  });
});

describe('IdleAction.status 边界', () => {
  test('status -> status(userId)，data 被忽略', async () => {
    const { action, facade } = makeAction();
    const res = await action.status(ctx(IDLE_CMD.status), { garbage: true });
    assert.deepEqual(facade.status.last, [1]);
    assert.equal(res, 'STATUS');
  });
});

describe('IdleAction.settle 参数边界', () => {
  test('两个可选参数均缺省 -> (userId, undefined, undefined)', async () => {
    const { action, facade } = makeAction();
    const res = await action.settle(ctx(IDLE_CMD.settle), {});
    assert.deepEqual(facade.settle.last, [1, undefined, undefined]);
    assert.equal(res, 'SETTLE');
    await action.settle(ctx(IDLE_CMD.settle), undefined);
    assert.deepEqual(facade.settle.last, [1, undefined, undefined]);
  });

  test('unitCode=null、hours=null -> 均视为缺省', async () => {
    const { action, facade } = makeAction();
    await action.settle(ctx(IDLE_CMD.settle), { unitCode: null, hours: null });
    assert.deepEqual(facade.settle.last, [1, undefined, undefined]);
  });

  const badUnit: unknown[] = ['', '   ', 123, {}, [], true];
  for (const unitCode of badUnit) {
    test('unitCode=' + JSON.stringify(unitCode) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.settle(ctx(IDLE_CMD.settle), { unitCode })), 'INVALID_PARAM');
      assert.equal(facade.settle.callCount, 0);
    });
  }

  const badHours: unknown[] = ['', '   ', 'abc', NaN, Infinity, -Infinity, true, {}, []];
  for (const hours of badHours) {
    test('hours=' + JSON.stringify(hours) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.settle(ctx(IDLE_CMD.settle), { hours })), 'INVALID_PARAM');
      assert.equal(facade.settle.callCount, 0);
    });
  }

  test('合法值：unitCode 去空白；hours 保留小数（0/负数/小数/上限）', async () => {
    const { action, facade } = makeAction();
    await action.settle(ctx(IDLE_CMD.settle), { unitCode: '  u1  ', hours: '1.5' });
    assert.deepEqual(facade.settle.last, [1, 'u1', 1.5]);
    await action.settle(ctx(IDLE_CMD.settle), { hours: 0 });
    assert.deepEqual(facade.settle.last, [1, undefined, 0]);
    await action.settle(ctx(IDLE_CMD.settle), { hours: -3.25 });
    assert.deepEqual(facade.settle.last, [1, undefined, -3.25]);
    await action.settle(ctx(IDLE_CMD.settle), { hours: Number.MAX_SAFE_INTEGER });
    assert.deepEqual(facade.settle.last, [1, undefined, Number.MAX_SAFE_INTEGER]);
  });

  test('unitCode 单独提供时仅传 unitCode', async () => {
    const { action, facade } = makeAction();
    await action.settle(ctx(IDLE_CMD.settle), { unitCode: 'u1' });
    assert.deepEqual(facade.settle.last, [1, 'u1', undefined]);
  });
});
