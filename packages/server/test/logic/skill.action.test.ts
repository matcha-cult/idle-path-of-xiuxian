import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SkillAction } from '../../src/modules/logic/skill/skill.action.js';
import { SKILL_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：SkillAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 skill.logic.service 测试覆盖。

function makeAction(): { action: SkillAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    catalog: stub(() => 'CATALOG'),
    learn: stub(() => 'LEARN'),
    getPanel: stub(() => 'PANEL'),
    putPanel: stub(() => 'PANEL_PUT'),
    enlighten: stub(() => 'ENLIGHTEN'),
    grantLingyun: stub(() => 'LINGYUN'),
    grantJade: stub(() => 'JADE'),
  };
  return { action: new SkillAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: SKILL_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: SkillAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['list', (a, d) => a.list(flowContext({ cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.list }), d)],
  ['learn', (a, d) => a.learn(flowContext({ cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.learn }), d)],
  ['panel', (a, d) => a.panel(flowContext({ cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.panel }), d)],
  ['panelUpdate', (a, d) => a.panelUpdate(flowContext({ cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.panelUpdate }), d)],
  ['enlighten', (a, d) => a.enlighten(flowContext({ cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.enlighten }), d)],
  ['lingyunGrant', (a, d) => a.lingyunGrant(flowContext({ cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.lingyunGrant }), d)],
  ['jadeGrant', (a, d) => a.jadeGrant(flowContext({ cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.jadeGrant }), d)],
];

describe('SkillAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.learn(flowContext({ userId: 0, cmd: SKILL_CMD.cmd, subCmd: SKILL_CMD.learn }), { skillId: 1 });
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.learn.callCount, 0);
  });
});

describe('SkillAction 无参 subCmd', () => {
  test('list -> catalog(userId)，data 被忽略', async () => {
    const { action, facade } = makeAction();
    const res = await action.list(ctx(SKILL_CMD.list), { anything: 1 });
    assert.deepEqual(facade.catalog.last, [1]);
    assert.equal(res, 'CATALOG');
  });

  test('panel -> getPanel(userId)', async () => {
    const { action, facade } = makeAction();
    const res = await action.panel(ctx(SKILL_CMD.panel), undefined);
    assert.deepEqual(facade.getPanel.last, [1]);
    assert.equal(res, 'PANEL');
  });
});

describe('SkillAction.learn / enlighten 参数边界', () => {
  const invalid: unknown[] = [undefined, null, '', '   ', 'abc', NaN, Infinity, -Infinity, true, {}, [], [1]];
  for (const skillId of invalid) {
    test('learn skillId=' + JSON.stringify(skillId) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.learn(ctx(SKILL_CMD.learn), { skillId })), 'INVALID_PARAM');
      assert.equal(facade.learn.callCount, 0);
    });
    test('enlighten skillId=' + JSON.stringify(skillId) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.enlighten(ctx(SKILL_CMD.enlighten), { skillId })), 'INVALID_PARAM');
      assert.equal(facade.enlighten.callCount, 0);
    });
  }

  const valid: Array<[unknown, number]> = [[0, 0], ['7.9', 7], [-3, -3], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]];
  for (const [input, expected] of valid) {
    test('learn skillId=' + JSON.stringify(input) + ' -> ' + String(expected), async () => {
      const { action, facade } = makeAction();
      const res = await action.learn(ctx(SKILL_CMD.learn), { skillId: input });
      assert.deepEqual(facade.learn.last, [1, expected]);
      assert.equal(res, 'LEARN');
    });
    test('enlighten skillId=' + JSON.stringify(input) + ' -> ' + String(expected), async () => {
      const { action, facade } = makeAction();
      const res = await action.enlighten(ctx(SKILL_CMD.enlighten), { skillId: input });
      assert.deepEqual(facade.enlighten.last, [1, expected]);
      assert.equal(res, 'ENLIGHTEN');
    });
  }
});

describe('SkillAction.panelUpdate 参数边界', () => {
  test('对象载荷原样透传（同一引用），无必填参数', async () => {
    const { action, facade } = makeAction();
    const payload = { slots: [1, 2], active: 'a', extra: { k: 1 } };
    const res = await action.panelUpdate(ctx(SKILL_CMD.panelUpdate), payload);
    assert.equal(facade.putPanel.last?.[0], 1);
    assert.strictEqual(facade.putPanel.last?.[1], payload);
    assert.equal(res, 'PANEL_PUT');
  });

  test('空对象 / undefined / null / 原始值 -> 空对象 {}，不报错', async () => {
    const { action, facade } = makeAction();
    for (const data of [{}, undefined, null, 42, 'x', true]) {
      await action.panelUpdate(ctx(SKILL_CMD.panelUpdate), data);
      assert.deepEqual(facade.putPanel.last, [1, {}]);
    }
  });
});

describe('SkillAction.lingyunGrant / jadeGrant 参数边界', () => {
  const invalid: unknown[] = [undefined, null, '', '   ', 'abc', NaN, Infinity, -Infinity, true, {}, [], [1]];
  for (const value of invalid) {
    test('lingyunGrant amount=' + JSON.stringify(value) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.lingyunGrant(ctx(SKILL_CMD.lingyunGrant), { amount: value })), 'INVALID_PARAM');
      assert.equal(facade.grantLingyun.callCount, 0);
    });
    test('jadeGrant count=' + JSON.stringify(value) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.jadeGrant(ctx(SKILL_CMD.jadeGrant), { count: value })), 'INVALID_PARAM');
      assert.equal(facade.grantJade.callCount, 0);
    });
  }

  test('合法数值：0 / 负数 / 小数向下取整 / 上限', async () => {
    const { action, facade } = makeAction();
    await action.lingyunGrant(ctx(SKILL_CMD.lingyunGrant), { amount: 0 });
    assert.deepEqual(facade.grantLingyun.last, [1, 0]);
    await action.lingyunGrant(ctx(SKILL_CMD.lingyunGrant), { amount: -5 });
    assert.deepEqual(facade.grantLingyun.last, [1, -5]);
    await action.lingyunGrant(ctx(SKILL_CMD.lingyunGrant), { amount: '2.9' });
    assert.deepEqual(facade.grantLingyun.last, [1, 2]);
    await action.lingyunGrant(ctx(SKILL_CMD.lingyunGrant), { amount: Number.MAX_SAFE_INTEGER });
    assert.deepEqual(facade.grantLingyun.last, [1, Number.MAX_SAFE_INTEGER]);

    await action.jadeGrant(ctx(SKILL_CMD.jadeGrant), { count: 0 });
    assert.deepEqual(facade.grantJade.last, [1, 0]);
    await action.jadeGrant(ctx(SKILL_CMD.jadeGrant), { count: '4.8' });
    assert.deepEqual(facade.grantJade.last, [1, 4]);
    await action.jadeGrant(ctx(SKILL_CMD.jadeGrant), { count: -1 });
    assert.deepEqual(facade.grantJade.last, [1, -1]);
  });
});
