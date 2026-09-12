import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EconomyAction } from '../../src/modules/logic/economy/economy.action.js';
import { ECONOMY_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：EconomyAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 economy.logic.service 测试覆盖。

function makeAction(): { action: EconomyAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    currencies: stub(() => 'CURRENCIES'),
    grantCurrency: stub(() => 'GRANT_CURRENCY'),
    craft: stub(() => 'CRAFT'),
    essences: stub(() => 'ESSENCES'),
    grantEssence: stub(() => 'GRANT_ESSENCE'),
  };
  return { action: new EconomyAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: ECONOMY_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: EconomyAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['currencies', (a, d) => a.currencies(flowContext({ cmd: ECONOMY_CMD.cmd, subCmd: ECONOMY_CMD.currencies }), d)],
  ['currencyGrant', (a, d) => a.currencyGrant(flowContext({ cmd: ECONOMY_CMD.cmd, subCmd: ECONOMY_CMD.currencyGrant }), d)],
  ['craft', (a, d) => a.craft(flowContext({ cmd: ECONOMY_CMD.cmd, subCmd: ECONOMY_CMD.craft }), d)],
  ['essences', (a, d) => a.essences(flowContext({ cmd: ECONOMY_CMD.cmd, subCmd: ECONOMY_CMD.essences }), d)],
  ['essenceGrant', (a, d) => a.essenceGrant(flowContext({ cmd: ECONOMY_CMD.cmd, subCmd: ECONOMY_CMD.essenceGrant }), d)],
];

describe('EconomyAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.currencyGrant(
      flowContext({ userId: 0, cmd: ECONOMY_CMD.cmd, subCmd: ECONOMY_CMD.currencyGrant }),
      { code: 'gold', count: 1 },
    );
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.grantCurrency.callCount, 0);
  });
});

describe('EconomyAction 无参 subCmd', () => {
  test('currencies -> currencies(userId)', async () => {
    const { action, facade } = makeAction();
    const res = await action.currencies(ctx(ECONOMY_CMD.currencies), { garbage: 1 });
    assert.deepEqual(facade.currencies.last, [1]);
    assert.equal(res, 'CURRENCIES');
  });

  test('essences -> essences(userId)', async () => {
    const { action, facade } = makeAction();
    const res = await action.essences(ctx(ECONOMY_CMD.essences), undefined);
    assert.deepEqual(facade.essences.last, [1]);
    assert.equal(res, 'ESSENCES');
  });
});

const badCode: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];

describe('EconomyAction.currencyGrant 参数边界', () => {
  for (const code of badCode) {
    test('code=' + JSON.stringify(code) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.currencyGrant(ctx(ECONOMY_CMD.currencyGrant), { code, count: 1 })), 'INVALID_PARAM');
      assert.equal(facade.grantCurrency.callCount, 0);
    });
  }

  const badCount: unknown[] = [undefined, null, '', '   ', 'abc', NaN, Infinity, -Infinity, true, {}, []];
  for (const count of badCount) {
    test('count=' + JSON.stringify(count) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.currencyGrant(ctx(ECONOMY_CMD.currencyGrant), { code: 'gold', count })), 'INVALID_PARAM');
      assert.equal(facade.grantCurrency.callCount, 0);
    });
  }

  test('code 去前后空白后透传；count 0/负数/小数取整/上限', async () => {
    const { action, facade } = makeAction();
    const res = await action.currencyGrant(ctx(ECONOMY_CMD.currencyGrant), { code: '  gold  ', count: '5.9' });
    assert.deepEqual(facade.grantCurrency.last, [1, 'gold', 5]);
    assert.equal(res, 'GRANT_CURRENCY');
    await action.currencyGrant(ctx(ECONOMY_CMD.currencyGrant), { code: 'gold', count: 0 });
    assert.deepEqual(facade.grantCurrency.last, [1, 'gold', 0]);
    await action.currencyGrant(ctx(ECONOMY_CMD.currencyGrant), { code: 'gold', count: -7 });
    assert.deepEqual(facade.grantCurrency.last, [1, 'gold', -7]);
    await action.currencyGrant(ctx(ECONOMY_CMD.currencyGrant), { code: 'gold', count: Number.MAX_SAFE_INTEGER });
    assert.deepEqual(facade.grantCurrency.last, [1, 'gold', Number.MAX_SAFE_INTEGER]);
  });

  test('超长 code 无长度上限，原样透传', async () => {
    const { action, facade } = makeAction();
    const long = 'c'.repeat(5000);
    await action.currencyGrant(ctx(ECONOMY_CMD.currencyGrant), { code: long, count: 1 });
    assert.deepEqual(facade.grantCurrency.last, [1, long, 1]);
  });
});

describe('EconomyAction.essenceGrant 参数边界', () => {
  for (const code of badCode) {
    test('code=' + JSON.stringify(code) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.essenceGrant(ctx(ECONOMY_CMD.essenceGrant), { code, count: 1 })), 'INVALID_PARAM');
      assert.equal(facade.grantEssence.callCount, 0);
    });
  }

  const badCount: unknown[] = [undefined, null, '', 'abc', NaN, Infinity, true, {}];
  for (const count of badCount) {
    test('count=' + JSON.stringify(count) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.essenceGrant(ctx(ECONOMY_CMD.essenceGrant), { code: 'fire', count })), 'INVALID_PARAM');
      assert.equal(facade.grantEssence.callCount, 0);
    });
  }

  test('code 去空白、count 取整并透传', async () => {
    const { action, facade } = makeAction();
    const res = await action.essenceGrant(ctx(ECONOMY_CMD.essenceGrant), { code: '  fire ', count: '3.7' });
    assert.deepEqual(facade.grantEssence.last, [1, 'fire', 3]);
    assert.equal(res, 'GRANT_ESSENCE');
    await action.essenceGrant(ctx(ECONOMY_CMD.essenceGrant), { code: 'fire', count: 0 });
    assert.deepEqual(facade.grantEssence.last, [1, 'fire', 0]);
  });
});

describe('EconomyAction.craft 参数边界', () => {
  test('缺 itemId -> INVALID_PARAM（优先于 op 校验）', async () => {
    const { action, facade } = makeAction();
    assert.equal(codeOf(await action.craft(ctx(ECONOMY_CMD.craft), { op: 'refine' })), 'INVALID_PARAM');
    assert.equal(facade.craft.callCount, 0);
  });

  test('itemId 非法 -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    for (const itemId of ['abc', NaN, Infinity, null, '', {}]) {
      assert.equal(codeOf(await action.craft(ctx(ECONOMY_CMD.craft), { itemId, op: 'refine' })), 'INVALID_PARAM');
    }
    assert.equal(facade.craft.callCount, 0);
  });

  const badOp: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const op of badOp) {
    test('op=' + JSON.stringify(op) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.craft(ctx(ECONOMY_CMD.craft), { itemId: 1, op })), 'INVALID_PARAM');
      assert.equal(facade.craft.callCount, 0);
    });
  }

  const extraCases: Array<[Record<string, unknown>, string | undefined]> = [
    [{ essenceCode: 'e1' }, 'e1'],
    [{ essenceCode: '  e1  ' }, 'e1'],
    [{ essenceCode: '', targetCode: 't1' }, 't1'],
    [{ essenceCode: '   ', targetCode: 't1' }, 't1'],
    [{ essenceCode: 123, targetCode: 't1' }, 't1'],
    [{ targetCode: '  t1  ' }, 't1'],
    [{ targetCode: '' }, undefined],
    [{}, undefined],
  ];
  for (const [extra, expected] of extraCases) {
    test('extraCode 选择 ' + JSON.stringify(extra) + ' -> ' + String(expected), async () => {
      const { action, facade } = makeAction();
      await action.craft(ctx(ECONOMY_CMD.craft), { itemId: 7, op: 'refine', ...extra });
      assert.deepEqual(facade.craft.last, [1, 7, 'refine', expected]);
    });
  }

  test('itemId=0 合法，op 去前后空白透传', async () => {
    const { action, facade } = makeAction();
    const res = await action.craft(ctx(ECONOMY_CMD.craft), { itemId: 0, op: '  refine  ' });
    assert.deepEqual(facade.craft.last, [1, 0, 'refine', undefined]);
    assert.equal(res, 'CRAFT');
  });
});
