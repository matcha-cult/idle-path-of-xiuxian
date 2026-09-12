import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CombatAction } from '../../src/modules/logic/combat/combat.action.js';
import { COMBAT_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：CombatAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 combat.logic.service 测试覆盖。

function makeAction(): { action: CombatAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    catalog: stub(() => 'CATALOG'),
    dropTables: stub(() => 'DROP_TABLES'),
    spawn: stub(() => 'SPAWN'),
    kill: stub(() => 'KILL'),
  };
  return { action: new CombatAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: COMBAT_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: CombatAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['units', (a, d) => a.units(flowContext({ cmd: COMBAT_CMD.cmd, subCmd: COMBAT_CMD.units }), d)],
  ['dropTables', (a, d) => a.dropTables(flowContext({ cmd: COMBAT_CMD.cmd, subCmd: COMBAT_CMD.dropTables }), d)],
  ['spawn', (a, d) => a.spawn(flowContext({ cmd: COMBAT_CMD.cmd, subCmd: COMBAT_CMD.spawn }), d)],
  ['kill', (a, d) => a.kill(flowContext({ cmd: COMBAT_CMD.cmd, subCmd: COMBAT_CMD.kill }), d)],
];

describe('CombatAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.spawn(flowContext({ userId: 0, cmd: COMBAT_CMD.cmd, subCmd: COMBAT_CMD.spawn }), { code: 'u1' });
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.spawn.callCount, 0);
  });
});

describe('CombatAction.units 参数边界', () => {
  test('无 realm/camp -> catalog(userId, {realm: undefined, camp: undefined})', async () => {
    const { action, facade } = makeAction();
    const res = await action.units(ctx(COMBAT_CMD.units), {});
    assert.deepEqual(facade.catalog.last, [1, { realm: undefined, camp: undefined }]);
    assert.equal(res, 'CATALOG');
  });

  test('realm 为 null / 缺省 -> undefined（不报错）', async () => {
    const { action, facade } = makeAction();
    await action.units(ctx(COMBAT_CMD.units), { realm: null });
    assert.deepEqual(facade.catalog.last, [1, { realm: undefined, camp: undefined }]);
  });

  const invalidRealm: unknown[] = [0, 15, -1, -100, 'abc', NaN, Infinity, -Infinity, '', true, {}, [], 0.9, Number.MAX_SAFE_INTEGER];
  for (const realm of invalidRealm) {
    test('realm=' + JSON.stringify(realm) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.units(ctx(COMBAT_CMD.units), { realm })), 'INVALID_PARAM');
      assert.equal(facade.catalog.callCount, 0);
    });
  }

  const validRealm: Array<[unknown, number]> = [
    [1, 1],
    [14, 14],
    ['1', 1],
    ['14', 14],
    [1.9, 1],
    [14.9, 14],
    ['14.9', 14],
  ];
  for (const [input, expected] of validRealm) {
    test('realm=' + JSON.stringify(input) + ' -> ' + String(expected), async () => {
      const { action, facade } = makeAction();
      await action.units(ctx(COMBAT_CMD.units), { realm: input });
      assert.deepEqual(facade.catalog.last, [1, { realm: expected, camp: undefined }]);
    });
  }

  const invalidCamp: unknown[] = ['x', 'HOSTILE', 'hostiles', '   ', ' friendly'];
  for (const camp of invalidCamp) {
    test('camp=' + JSON.stringify(camp) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.units(ctx(COMBAT_CMD.units), { camp })), 'INVALID_PARAM');
      assert.equal(facade.catalog.callCount, 0);
    });
  }

  for (const camp of ['hostile', 'neutral', 'friendly']) {
    test('camp=' + camp + '（白名单）-> 透传', async () => {
      const { action, facade } = makeAction();
      await action.units(ctx(COMBAT_CMD.units), { camp });
      assert.deepEqual(facade.catalog.last, [1, { realm: undefined, camp }]);
    });
  }

  const campAsUndefined: unknown[] = [undefined, null, '', 123, {}, [], true];
  for (const camp of campAsUndefined) {
    test('camp=' + JSON.stringify(camp) + '（非字符串/空）-> undefined', async () => {
      const { action, facade } = makeAction();
      await action.units(ctx(COMBAT_CMD.units), { camp });
      assert.deepEqual(facade.catalog.last, [1, { realm: undefined, camp: undefined }]);
    });
  }

  test('realm 与 camp 同时提供 -> 一并透传', async () => {
    const { action, facade } = makeAction();
    await action.units(ctx(COMBAT_CMD.units), { realm: 14, camp: 'friendly' });
    assert.deepEqual(facade.catalog.last, [1, { realm: 14, camp: 'friendly' }]);
  });
});

describe('CombatAction.dropTables 边界', () => {
  test('dropTables -> dropTables(userId)', async () => {
    const { action, facade } = makeAction();
    const res = await action.dropTables(ctx(COMBAT_CMD.dropTables), { garbage: 1 });
    assert.deepEqual(facade.dropTables.last, [1]);
    assert.equal(res, 'DROP_TABLES');
  });
});

describe('CombatAction.spawn 参数边界', () => {
  const badCode: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const code of badCode) {
    test('code=' + JSON.stringify(code) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.spawn(ctx(COMBAT_CMD.spawn), { code })), 'INVALID_PARAM');
      assert.equal(facade.spawn.callCount, 0);
    });
  }

  const badHidden: unknown[] = ['abc', NaN, Infinity, -Infinity, true, {}, []];
  for (const hiddenCount of badHidden) {
    test('hiddenCount=' + JSON.stringify(hiddenCount) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.spawn(ctx(COMBAT_CMD.spawn), { code: 'u1', hiddenCount })), 'INVALID_PARAM');
      assert.equal(facade.spawn.callCount, 0);
    });
  }

  test('code 去空白；hiddenCount 缺省/null -> undefined', async () => {
    const { action, facade } = makeAction();
    const res = await action.spawn(ctx(COMBAT_CMD.spawn), { code: '  u1  ' });
    assert.deepEqual(facade.spawn.last, [1, 'u1', undefined]);
    assert.equal(res, 'SPAWN');
    await action.spawn(ctx(COMBAT_CMD.spawn), { code: 'u1', hiddenCount: null });
    assert.deepEqual(facade.spawn.last, [1, 'u1', undefined]);
  });

  test('hiddenCount 0 / 负数 / 小数取整', async () => {
    const { action, facade } = makeAction();
    await action.spawn(ctx(COMBAT_CMD.spawn), { code: 'u1', hiddenCount: 0 });
    assert.deepEqual(facade.spawn.last, [1, 'u1', 0]);
    await action.spawn(ctx(COMBAT_CMD.spawn), { code: 'u1', hiddenCount: -1 });
    assert.deepEqual(facade.spawn.last, [1, 'u1', -1]);
    await action.spawn(ctx(COMBAT_CMD.spawn), { code: 'u1', hiddenCount: '2.9' });
    assert.deepEqual(facade.spawn.last, [1, 'u1', 2]);
  });
});

describe('CombatAction.kill 参数边界', () => {
  const badCode: unknown[] = [undefined, null, '', '   ', 123, {}, []];
  for (const code of badCode) {
    test('code=' + JSON.stringify(code) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.kill(ctx(COMBAT_CMD.kill), { code })), 'INVALID_PARAM');
      assert.equal(facade.kill.callCount, 0);
    });
  }

  const badCount: unknown[] = ['abc', NaN, Infinity, true, {}, []];
  for (const count of badCount) {
    test('count=' + JSON.stringify(count) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.kill(ctx(COMBAT_CMD.kill), { code: 'u1', count })), 'INVALID_PARAM');
      assert.equal(facade.kill.callCount, 0);
    });
  }

  test('code 去空白；count 缺省/null -> undefined；0/负数/小数取整', async () => {
    const { action, facade } = makeAction();
    const res = await action.kill(ctx(COMBAT_CMD.kill), { code: '  u1 ' });
    assert.deepEqual(facade.kill.last, [1, 'u1', undefined]);
    assert.equal(res, 'KILL');
    await action.kill(ctx(COMBAT_CMD.kill), { code: 'u1', count: null });
    assert.deepEqual(facade.kill.last, [1, 'u1', undefined]);
    await action.kill(ctx(COMBAT_CMD.kill), { code: 'u1', count: 0 });
    assert.deepEqual(facade.kill.last, [1, 'u1', 0]);
    await action.kill(ctx(COMBAT_CMD.kill), { code: 'u1', count: -2 });
    assert.deepEqual(facade.kill.last, [1, 'u1', -2]);
    await action.kill(ctx(COMBAT_CMD.kill), { code: 'u1', count: '3.8' });
    assert.deepEqual(facade.kill.last, [1, 'u1', 3]);
  });
});
