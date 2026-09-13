import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MapAction } from '../../src/modules/logic/map/map.action.js';
import { MAP_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：MapAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// DB 的无行/单行/多行与幂等由 map.service.test.ts 覆盖。

function makeAction(): { action: MapAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    list: stub(() => 'LIST'),
    enter: stub(() => 'ENTER'),
    waypoint: stub(() => 'WAYPOINT'),
  };
  return { action: new MapAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: MAP_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: MapAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['list', (a, d) => a.list(flowContext({ cmd: MAP_CMD.cmd, subCmd: MAP_CMD.list }), d)],
  ['enter', (a, d) => a.enter(flowContext({ cmd: MAP_CMD.cmd, subCmd: MAP_CMD.enter }), d)],
  ['waypoint', (a, d) => a.waypoint(flowContext({ cmd: MAP_CMD.cmd, subCmd: MAP_CMD.waypoint }), d)],
];

describe('MapAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0 视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.enter(flowContext({ userId: 0, cmd: MAP_CMD.cmd, subCmd: MAP_CMD.enter }), { nodeCode: 'n1' });
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.enter.callCount, 0);
  });
});

describe('MapAction.list', () => {
  test('list -> list(userId)，忽略请求体', async () => {
    const { action, facade } = makeAction();
    const res = await action.list(ctx(MAP_CMD.list), { garbage: 1 });
    assert.deepEqual(facade.list.last, [1]);
    assert.equal(res, 'LIST');
  });
});

describe('MapAction.enter 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const nodeCode of bad) {
    test('nodeCode=' + JSON.stringify(nodeCode) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.enter(ctx(MAP_CMD.enter), { nodeCode })), 'INVALID_PARAM');
      assert.equal(facade.enter.callCount, 0);
    });
  }

  test('nodeCode 去前后空白后透传；超长无上限', async () => {
    const { action, facade } = makeAction();
    assert.equal(await action.enter(ctx(MAP_CMD.enter), { nodeCode: '  n1  ' }), 'ENTER');
    assert.deepEqual(facade.enter.last, [1, 'n1']);
    const long = 'n'.repeat(5000);
    await action.enter(ctx(MAP_CMD.enter), { nodeCode: long });
    assert.deepEqual(facade.enter.last, [1, long]);
  });
});

describe('MapAction.waypoint 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const nodeCode of bad) {
    test('nodeCode=' + JSON.stringify(nodeCode) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.waypoint(ctx(MAP_CMD.waypoint), { nodeCode })), 'INVALID_PARAM');
      assert.equal(facade.waypoint.callCount, 0);
    });
  }

  test('nodeCode 合法 -> 去空白透传', async () => {
    const { action, facade } = makeAction();
    assert.equal(await action.waypoint(ctx(MAP_CMD.waypoint), { nodeCode: ' n3 ' }), 'WAYPOINT');
    assert.deepEqual(facade.waypoint.last, [1, 'n3']);
  });
});
