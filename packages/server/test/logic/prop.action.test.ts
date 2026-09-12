import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PropAction } from '../../src/modules/logic/prop/prop.action.js';
import { PROP_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：PropAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 prop.logic.service 测试覆盖。

function makeAction(): { action: PropAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    discard: stub(() => 'DISCARD'),
    generate: stub(() => 'GENERATE'),
  };
  return { action: new PropAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: PROP_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: PropAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['discard', (a, d) => a.discard(flowContext({ cmd: PROP_CMD.cmd, subCmd: PROP_CMD.discard }), d)],
  ['generate', (a, d) => a.generate(flowContext({ cmd: PROP_CMD.cmd, subCmd: PROP_CMD.generate }), d)],
];

describe('PropAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.discard(
      flowContext({ userId: 0, cmd: PROP_CMD.cmd, subCmd: PROP_CMD.discard }),
      { itemId: 1 },
    );
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.discard.callCount, 0);
  });
});

describe('PropAction.discard 参数边界', () => {
  const invalid: unknown[] = [undefined, null, '', '   ', 'abc', '12abc', NaN, Infinity, -Infinity, true, false, {}, [], [5]];
  for (const itemId of invalid) {
    test('itemId=' + JSON.stringify(itemId) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.discard(ctx(PROP_CMD.discard), { itemId })), 'INVALID_PARAM');
      assert.equal(facade.discard.callCount, 0);
    });
  }

  for (const data of [undefined, null, 'x', 42, true]) {
    test('data=' + JSON.stringify(data) + '（非对象）-> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.discard(ctx(PROP_CMD.discard), data)), 'INVALID_PARAM');
      assert.equal(facade.discard.callCount, 0);
    });
  }

  const valid: Array<[unknown, number]> = [
    [5, 5],
    ['7.9', 7],
    [0, 0],
    [-1, -1],
    [-3.9, -4],
    [' 12 ', 12],
    ['0x10', 16],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ];
  for (const [input, expected] of valid) {
    test('itemId=' + JSON.stringify(input) + ' -> 透传 ' + String(expected), async () => {
      const { action, facade } = makeAction();
      const res = await action.discard(ctx(PROP_CMD.discard), { itemId: input });
      assert.deepEqual(facade.discard.last, [1, expected]);
      assert.equal(res, 'DISCARD');
    });
  }
});

describe('PropAction.generate 参数边界', () => {
  test('baseId 与 rarity 均缺失 -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    assert.equal(codeOf(await action.generate(ctx(PROP_CMD.generate), {})), 'INVALID_PARAM');
    assert.equal(codeOf(await action.generate(ctx(PROP_CMD.generate), undefined)), 'INVALID_PARAM');
    assert.equal(facade.generate.callCount, 0);
  });

  test('缺 rarity -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    assert.equal(codeOf(await action.generate(ctx(PROP_CMD.generate), { baseId: 1 })), 'INVALID_PARAM');
    assert.equal(facade.generate.callCount, 0);
  });

  test('缺 baseId -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    assert.equal(codeOf(await action.generate(ctx(PROP_CMD.generate), { rarity: 1 })), 'INVALID_PARAM');
    assert.equal(facade.generate.callCount, 0);
  });

  const bad: unknown[] = [undefined, null, '', '   ', 'abc', NaN, Infinity, -Infinity, true, {}, []];
  for (const value of bad) {
    test('baseId=' + JSON.stringify(value) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.generate(ctx(PROP_CMD.generate), { baseId: value, rarity: 1 })), 'INVALID_PARAM');
      assert.equal(facade.generate.callCount, 0);
    });
    test('rarity=' + JSON.stringify(value) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.generate(ctx(PROP_CMD.generate), { baseId: 1, rarity: value })), 'INVALID_PARAM');
      assert.equal(facade.generate.callCount, 0);
    });
  }

  test('characterId 缺省 / null / 非法 -> null（不报错）', async () => {
    const { action, facade } = makeAction();
    await action.generate(ctx(PROP_CMD.generate), { baseId: 2, rarity: 3 });
    assert.deepEqual(facade.generate.last, [1, 2, 3, null]);
    await action.generate(ctx(PROP_CMD.generate), { baseId: 2, rarity: 3, characterId: null });
    assert.deepEqual(facade.generate.last, [1, 2, 3, null]);
    await action.generate(ctx(PROP_CMD.generate), { baseId: 2, rarity: 3, characterId: 'abc' });
    assert.deepEqual(facade.generate.last, [1, 2, 3, null]);
  });

  test('characterId 小数向下取整、0/负数原样透传', async () => {
    const { action, facade } = makeAction();
    await action.generate(ctx(PROP_CMD.generate), { baseId: 2, rarity: 3, characterId: '5.9' });
    assert.deepEqual(facade.generate.last, [1, 2, 3, 5]);
    await action.generate(ctx(PROP_CMD.generate), { baseId: 2, rarity: 3, characterId: 0 });
    assert.deepEqual(facade.generate.last, [1, 2, 3, 0]);
    await action.generate(ctx(PROP_CMD.generate), { baseId: 2, rarity: 3, characterId: -4 });
    assert.deepEqual(facade.generate.last, [1, 2, 3, -4]);
  });

  test('合法数值边界：0 / 负数 / 小数', async () => {
    const { action, facade } = makeAction();
    await action.generate(ctx(PROP_CMD.generate), { baseId: 0, rarity: 0 });
    assert.deepEqual(facade.generate.last, [1, 0, 0, null]);
    await action.generate(ctx(PROP_CMD.generate), { baseId: -1, rarity: -2 });
    assert.deepEqual(facade.generate.last, [1, -1, -2, null]);
    await action.generate(ctx(PROP_CMD.generate), { baseId: '3.9', rarity: '4.1' });
    assert.deepEqual(facade.generate.last, [1, 3, 4, null]);
  });

  test('超长数字串溢出为 Infinity -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    assert.equal(codeOf(await action.generate(ctx(PROP_CMD.generate), { baseId: '9'.repeat(400), rarity: 1 })), 'INVALID_PARAM');
    assert.equal(facade.generate.callCount, 0);
  });

  test('门面拒绝 -> 原样传播（Action 不吞异常）', async () => {
    const facade = { discard: stub(), generate: stub(() => Promise.reject(new Error('db down'))) };
    const action = new PropAction(facade as never);
    await assert.rejects(() => action.generate(ctx(PROP_CMD.generate), { baseId: 1, rarity: 1 }), /db down/);
  });
});
