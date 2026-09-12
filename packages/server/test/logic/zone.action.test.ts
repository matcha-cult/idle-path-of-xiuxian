import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ZoneAction } from '../../src/modules/logic/zone/zone.action.js';
import { ZONE_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：ZoneAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 zone.logic.service 测试覆盖。

function makeAction(): { action: ZoneAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    catalog: stub(() => 'CATALOG'),
    progress: stub(() => 'PROGRESS'),
    enter: stub(() => 'ENTER'),
    challenge: stub(() => 'CHALLENGE'),
  };
  return { action: new ZoneAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: ZONE_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: ZoneAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['zones', (a, d) => a.zones(flowContext({ cmd: ZONE_CMD.cmd, subCmd: ZONE_CMD.zones }), d)],
  ['progress', (a, d) => a.progress(flowContext({ cmd: ZONE_CMD.cmd, subCmd: ZONE_CMD.progress }), d)],
  ['enter', (a, d) => a.enter(flowContext({ cmd: ZONE_CMD.cmd, subCmd: ZONE_CMD.enter }), d)],
  ['challenge', (a, d) => a.challenge(flowContext({ cmd: ZONE_CMD.cmd, subCmd: ZONE_CMD.challenge }), d)],
];

describe('ZoneAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.enter(flowContext({ userId: 0, cmd: ZONE_CMD.cmd, subCmd: ZONE_CMD.enter }), { zoneCode: 'z1' });
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.enter.callCount, 0);
  });
});

describe('ZoneAction 无参 subCmd', () => {
  test('zones -> catalog(userId)', async () => {
    const { action, facade } = makeAction();
    const res = await action.zones(ctx(ZONE_CMD.zones), { garbage: 1 });
    assert.deepEqual(facade.catalog.last, [1]);
    assert.equal(res, 'CATALOG');
  });

  test('progress -> progress(userId)', async () => {
    const { action, facade } = makeAction();
    const res = await action.progress(ctx(ZONE_CMD.progress), undefined);
    assert.deepEqual(facade.progress.last, [1]);
    assert.equal(res, 'PROGRESS');
  });
});

describe('ZoneAction.enter 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const zoneCode of bad) {
    test('zoneCode=' + JSON.stringify(zoneCode) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.enter(ctx(ZONE_CMD.enter), { zoneCode })), 'INVALID_PARAM');
      assert.equal(facade.enter.callCount, 0);
    });
  }

  test('zoneCode 去前后空白后透传；超长无上限', async () => {
    const { action, facade } = makeAction();
    const res = await action.enter(ctx(ZONE_CMD.enter), { zoneCode: '  z1  ' });
    assert.deepEqual(facade.enter.last, [1, 'z1']);
    assert.equal(res, 'ENTER');
    const long = 'z'.repeat(5000);
    await action.enter(ctx(ZONE_CMD.enter), { zoneCode: long });
    assert.deepEqual(facade.enter.last, [1, long]);
  });
});

describe('ZoneAction.challenge 参数边界', () => {
  test('缺 zoneCode -> challenge(userId, undefined)', async () => {
    const { action, facade } = makeAction();
    const res = await action.challenge(ctx(ZONE_CMD.challenge), {});
    assert.deepEqual(facade.challenge.last, [1, undefined]);
    assert.equal(res, 'CHALLENGE');
  });

  test('zoneCode=null / undefined 显式传入 -> undefined（可选）', async () => {
    const { action, facade } = makeAction();
    await action.challenge(ctx(ZONE_CMD.challenge), { zoneCode: null });
    assert.deepEqual(facade.challenge.last, [1, undefined]);
    await action.challenge(ctx(ZONE_CMD.challenge), { zoneCode: undefined });
    assert.deepEqual(facade.challenge.last, [1, undefined]);
  });

  const bad: unknown[] = ['', '   ', 123, true, {}, []];
  for (const zoneCode of bad) {
    test('zoneCode=' + JSON.stringify(zoneCode) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.challenge(ctx(ZONE_CMD.challenge), { zoneCode })), 'INVALID_PARAM');
      assert.equal(facade.challenge.callCount, 0);
    });
  }

  test('zoneCode 合法 -> 去空白透传', async () => {
    const { action, facade } = makeAction();
    const res = await action.challenge(ctx(ZONE_CMD.challenge), { zoneCode: '  z9 ' });
    assert.deepEqual(facade.challenge.last, [1, 'z9']);
    assert.equal(res, 'CHALLENGE');
  });
});
