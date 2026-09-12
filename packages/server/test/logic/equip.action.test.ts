import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EquipAction } from '../../src/modules/logic/equip/equip.action.js';
import { EQUIP_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：EquipAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 equip.logic.service 测试覆盖。

function makeAction(): { action: EquipAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    equip: stub(() => 'EQUIP'),
    unequip: stub(() => 'UNEQUIP'),
    equipment: stub(() => 'EQUIPMENT'),
  };
  return { action: new EquipAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: EQUIP_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: EquipAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['equip', (a, d) => a.equip(flowContext({ cmd: EQUIP_CMD.cmd, subCmd: EQUIP_CMD.equip }), d)],
  ['unequip', (a, d) => a.unequip(flowContext({ cmd: EQUIP_CMD.cmd, subCmd: EQUIP_CMD.unequip }), d)],
  ['equipment', (a, d) => a.equipment(flowContext({ cmd: EQUIP_CMD.cmd, subCmd: EQUIP_CMD.equipment }), d)],
];

describe('EquipAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.equip(flowContext({ userId: 0, cmd: EQUIP_CMD.cmd, subCmd: EQUIP_CMD.equip }), { itemId: 1 });
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.equip.callCount, 0);
  });
});

describe('EquipAction.equip / unequip 参数边界', () => {
  const invalid: unknown[] = [undefined, null, '', '   ', 'abc', '7.' + 'x', NaN, Infinity, -Infinity, true, {}, [], [7]];
  for (const itemId of invalid) {
    test('equip itemId=' + JSON.stringify(itemId) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.equip(ctx(EQUIP_CMD.equip), { itemId })), 'INVALID_PARAM');
      assert.equal(facade.equip.callCount, 0);
    });
    test('unequip itemId=' + JSON.stringify(itemId) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.unequip(ctx(EQUIP_CMD.unequip), { itemId })), 'INVALID_PARAM');
      assert.equal(facade.unequip.callCount, 0);
    });
  }

  for (const data of [undefined, null, 'x', 42]) {
    test('equip data=' + JSON.stringify(data) + '（非对象）-> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.equip(ctx(EQUIP_CMD.equip), data)), 'INVALID_PARAM');
      assert.equal(facade.equip.callCount, 0);
    });
  }

  const valid: Array<[unknown, number]> = [
    [3, 3],
    ['9.8', 9],
    [0, 0],
    [-2, -2],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ];
  for (const [input, expected] of valid) {
    test('equip itemId=' + JSON.stringify(input) + ' -> ' + String(expected), async () => {
      const { action, facade } = makeAction();
      const res = await action.equip(ctx(EQUIP_CMD.equip), { itemId: input });
      assert.deepEqual(facade.equip.last, [1, expected]);
      assert.equal(res, 'EQUIP');
    });
    test('unequip itemId=' + JSON.stringify(input) + ' -> ' + String(expected), async () => {
      const { action, facade } = makeAction();
      const res = await action.unequip(ctx(EQUIP_CMD.unequip), { itemId: input });
      assert.deepEqual(facade.unequip.last, [1, expected]);
      assert.equal(res, 'UNEQUIP');
    });
  }
});

describe('EquipAction.equipment 边界', () => {
  test('无参数 -> equipment(userId)，data 被忽略', async () => {
    const { action, facade } = makeAction();
    const res = await action.equipment(ctx(EQUIP_CMD.equipment), undefined);
    assert.deepEqual(facade.equipment.last, [1]);
    assert.equal(res, 'EQUIPMENT');
    await action.equipment(ctx(EQUIP_CMD.equipment), { garbage: true });
    assert.deepEqual(facade.equipment.last, [1]);
  });
});
