import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ItemAction } from '../../src/modules/logic/item/item.action.js';
import { ITEM_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

function makeAction(): { action: ItemAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    inventory: stub(() => 'INVENTORY'),
    detail: stub(() => 'DETAIL'),
    bases: stub(() => 'BASES'),
    listPickupRules: stub(() => 'LIST_RULES'),
    createPickupRule: stub(() => 'CREATE_RULE'),
    updatePickupRule: stub(() => 'UPDATE_RULE'),
    deletePickupRule: stub(() => 'DELETE_RULE'),
  };
  return { action: new ItemAction(facade as never), facade };
}

const ctx = (userId?: number) => flowContext({ userId: userId ?? 1, cmd: ITEM_CMD.cmd, subCmd: 1 });

describe('ItemAction 鉴权边界', () => {
  test('未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
    const { action, facade } = makeAction();
    const res = (await action.inventory(flowContext({ cmd: ITEM_CMD.cmd, subCmd: 1 }), {})) as {
      data: { code: string };
    };
    assert.equal(res.data.code, 'UNAUTHORIZED');
    assert.equal(facade.inventory.callCount, 0);
  });
});

describe('ItemAction.inventory 参数边界', () => {
  test('缺省参数 -> page=1, pageSize=20，其余 undefined', async () => {
    const { action, facade } = makeAction();
    await action.inventory(ctx(), {});
    assert.deepEqual(facade.inventory.last, [
      1,
      { category: undefined, rarity: undefined, tierMin: undefined, tierMax: undefined, page: 1, pageSize: 20 },
    ]);
  });

  test('字符串数值被解析；空 category 归一为 undefined', async () => {
    const { action, facade } = makeAction();
    await action.inventory(ctx(), { category: '', rarity: '2', tierMin: '1', tierMax: '5', page: '3', pageSize: '50' });
    assert.deepEqual(facade.inventory.last, [
      1,
      { category: undefined, rarity: 2, tierMin: 1, tierMax: 5, page: 3, pageSize: 50 },
    ]);
  });

  test('非法数值 -> undefined（交由服务层默认/校验）', async () => {
    const { action, facade } = makeAction();
    await action.inventory(ctx(), { rarity: 'abc', page: 'NaN' });
    const filters = facade.inventory.last?.[1] as Record<string, unknown>;
    assert.equal(filters.rarity, undefined);
    assert.equal(filters.page, 1);
  });
});

describe('ItemAction.inventoryDetail 边界', () => {
  test('缺 id -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    const res = (await action.inventoryDetail(ctx(), {})) as { data: { code: string } };
    assert.equal(res.data.code, 'INVALID_PARAM');
    assert.equal(facade.detail.callCount, 0);
  });
  test('id 为小数 -> 向下取整', async () => {
    const { action, facade } = makeAction();
    await action.inventoryDetail(ctx(), { id: '7.9' });
    assert.deepEqual(facade.detail.last, [1, 7]);
  });
  test('id 为 0 -> 合法（边界）', async () => {
    const { action, facade } = makeAction();
    await action.inventoryDetail(ctx(), { id: 0 });
    assert.deepEqual(facade.detail.last, [1, 0]);
  });
});

describe('ItemAction.bases 边界', () => {
  const cases: Array<[unknown, number]> = [['1', 1], [1, 1], [0, 0], [undefined, 0], ['x', 0]];
  for (const [input, expected] of cases) {
    test(`withPool=${JSON.stringify(input)} -> ${expected}`, async () => {
      const { action, facade } = makeAction();
      await action.bases(ctx(), input === undefined ? {} : { withPool: input });
      const filters = facade.bases.last?.[0] as Record<string, unknown>;
      assert.equal(filters.withPool, expected);
      assert.equal(filters.page, 1);
      assert.equal(filters.pageSize, 20);
    });
  }
});

describe('ItemAction 拾取规则 边界', () => {
  test('update 缺 id -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    const res = (await action.pickupRuleUpdate(ctx(), { name: 'x' })) as { data: { code: string } };
    assert.equal(res.data.code, 'INVALID_PARAM');
    assert.equal(facade.updatePickupRule.callCount, 0);
  });
  test('update 接受 ruleId 别名', async () => {
    const { action, facade } = makeAction();
    await action.pickupRuleUpdate(ctx(), { ruleId: '9', name: 'x' });
    assert.equal(facade.updatePickupRule.last?.[1], 9);
  });
  test('delete 缺 id -> INVALID_PARAM', async () => {
    const { action, facade } = makeAction();
    const res = (await action.pickupRuleDelete(ctx(), {})) as { data: { code: string } };
    assert.equal(res.data.code, 'INVALID_PARAM');
    assert.equal(facade.deletePickupRule.callCount, 0);
  });
  test('create 透传字段（未提供字段为 undefined）', async () => {
    const { action, facade } = makeAction();
    await action.pickupRuleCreate(ctx(), { name: '规则A', rarityMin: 2, action: 'salvage' });
    assert.deepEqual(facade.createPickupRule.last, [
      1,
      { name: '规则A', rarityMin: 2, tierMin: undefined, affixCodes: undefined, action: 'salvage', enabled: undefined, priority: undefined },
    ]);
  });
  test('list 不需要参数', async () => {
    const { action, facade } = makeAction();
    await action.pickupRuleList(ctx(), undefined);
    assert.deepEqual(facade.listPickupRules.last, [1]);
  });
});
