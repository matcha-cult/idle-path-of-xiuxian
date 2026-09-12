import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RealmAction } from '../../src/modules/logic/realm/realm.action.js';
import { REALM_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：RealmAction 无业务参数，仅鉴权后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 realm.logic.service 测试覆盖。

function makeAction(): { action: RealmAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    status: stub(() => 'STATUS'),
    breakthrough: stub(() => 'BREAKTHROUGH'),
  };
  return { action: new RealmAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: REALM_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: RealmAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['breakthroughInfo', (a, d) => a.breakthroughInfo(flowContext({ cmd: REALM_CMD.cmd, subCmd: REALM_CMD.breakthroughInfo }), d)],
  ['breakthrough', (a, d) => a.breakthrough(flowContext({ cmd: REALM_CMD.cmd, subCmd: REALM_CMD.breakthrough }), d)],
];

describe('RealmAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.breakthrough(flowContext({ userId: 0, cmd: REALM_CMD.cmd, subCmd: REALM_CMD.breakthrough }), {});
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.breakthrough.callCount, 0);
  });
});

describe('RealmAction 无参 subCmd', () => {
  test('breakthroughInfo -> status(userId)，data 被忽略', async () => {
    const { action, facade } = makeAction();
    const res = await action.breakthroughInfo(ctx(REALM_CMD.breakthroughInfo), { garbage: true });
    assert.deepEqual(facade.status.last, [1]);
    assert.equal(res, 'STATUS');
  });

  test('breakthrough -> breakthrough(userId)，data 被忽略', async () => {
    const { action, facade } = makeAction();
    const res = await action.breakthrough(ctx(REALM_CMD.breakthrough), undefined);
    assert.deepEqual(facade.breakthrough.last, [1]);
    assert.equal(res, 'BREAKTHROUGH');
  });

  test('重复调用 -> 每次均转交门面（幂等性由 service 层保证）', async () => {
    const { action, facade } = makeAction();
    await action.breakthrough(ctx(REALM_CMD.breakthrough), undefined);
    await action.breakthrough(ctx(REALM_CMD.breakthrough), undefined);
    assert.equal(facade.breakthrough.callCount, 2);
  });
});
