import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getActionControllerCmd } from '@nbb-ionet/core-framework';
import {
  GAME_ACTION_CLASSES,
  GAME_INOUT_CLASSES,
} from '../../src/ionet/game-actions.js';
import { CMD_SEGMENTS } from '../../src/ionet/cmd.js';

const EXPECTED: Array<[string, number]> = [
  ['HealthAction', CMD_SEGMENTS.system],
  ['ItemAction', CMD_SEGMENTS.item],
  ['PropAction', CMD_SEGMENTS.prop],
  ['EquipAction', CMD_SEGMENTS.equip],
  ['SkillAction', CMD_SEGMENTS.skill],
  ['EconomyAction', CMD_SEGMENTS.economy],
  ['RealmAction', CMD_SEGMENTS.realm],
  ['CombatAction', CMD_SEGMENTS.combat],
  ['ZoneAction', CMD_SEGMENTS.zone],
  ['QuestAction', CMD_SEGMENTS.quest],
  ['StoryAction', CMD_SEGMENTS.story],
  ['IdleAction', CMD_SEGMENTS.idle],
];

describe('逻辑服路由表边界（任务 4 后由 resolveAction 注册，清单见 game-actions.ts）', () => {
  test('登记 12 个 Action，顺序与层一致', () => {
    assert.deepEqual(GAME_ACTION_CLASSES.map((c) => c.name), EXPECTED.map(([name]) => name));
  });

  test('每个 Action 的 @ActionController cmd 与预期一致', () => {
    GAME_ACTION_CLASSES.forEach((ActionClass, index) => {
      const cmd = getActionControllerCmd(ActionClass);
      assert.equal(cmd, EXPECTED[index][1], `${ActionClass.name} cmd 不符`);
    });
  });

  test('cmd 段无重复', () => {
    const cmds = GAME_ACTION_CLASSES.map((c) => getActionControllerCmd(c));
    assert.equal(new Set(cmds).size, cmds.length);
  });

  test('未登记的段（auth=10 / character=20）不被任何 Action 占用', () => {
    const cmds = new Set(GAME_ACTION_CLASSES.map((c) => getActionControllerCmd(c)));
    assert.equal(cmds.has(CMD_SEGMENTS.auth), false);
    assert.equal(cmds.has(CMD_SEGMENTS.character), false);
  });

  test('InOut 列表为空（鉴权已迁到 WS 握手，见 app.module 的 wsServer.authenticate）', () => {
    assert.equal(GAME_INOUT_CLASSES.length, 0);
  });
});
