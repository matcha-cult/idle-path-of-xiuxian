import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CMD_SEGMENTS,
  COMBAT_CMD,
  ECONOMY_CMD,
  EQUIP_CMD,
  IDLE_CMD,
  ITEM_CMD,
  PROP_CMD,
  PUBLIC_ACTION_KEYS,
  QUEST_CMD,
  REALM_CMD,
  SKILL_CMD,
  STORY_CMD,
  SYSTEM_CMD,
  ZONE_CMD,
  cmdMerge,
} from '../../src/ionet/cmd.js';

describe('cmdMerge 边界', () => {
  test('(0,0) -> 0', () => assert.equal(cmdMerge(0, 0), 0));
  test('(1,1) -> 65537', () => assert.equal(cmdMerge(1, 1), 65537));
  test('subCmd 取低 16 位', () => assert.equal(cmdMerge(1, 0xffff), (1 << 16) | 0xffff));
  test('不同 cmd 段不碰撞', () => {
    const seen = new Set<number>();
    for (const seg of Object.values(CMD_SEGMENTS)) {
      for (let sub = 1; sub <= 9; sub += 1) {
        const key = cmdMerge(seg, sub);
        assert.equal(seen.has(key), false, `碰撞 cmd=${seg} sub=${sub}`);
        seen.add(key);
      }
    }
  });
});

describe('cmd 段分配边界', () => {
  test('段值唯一且为 10 的倍数（system 除外）', () => {
    const values = Object.values(CMD_SEGMENTS);
    assert.equal(new Set(values).size, values.length, '段值必须唯一');
    for (const [name, value] of Object.entries(CMD_SEGMENTS)) {
      if (name === 'system') continue;
      assert.equal(value % 10, 0, `${name} 段值应为 10 的倍数`);
    }
  });
  test('段间距 >= 9（system=1 → auth=10），后续段间距 = 10', () => {
    const sorted = [...Object.values(CMD_SEGMENTS)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i] - sorted[i - 1] >= 9, `段间距不足: ${sorted[i - 1]} -> ${sorted[i]}`);
    }
  });
  test('各域 cmd 与所属段一致', () => {
    assert.equal(SYSTEM_CMD.cmd, CMD_SEGMENTS.system);
    assert.equal(ITEM_CMD.cmd, CMD_SEGMENTS.item);
    assert.equal(PROP_CMD.cmd, CMD_SEGMENTS.prop);
    assert.equal(EQUIP_CMD.cmd, CMD_SEGMENTS.equip);
    assert.equal(SKILL_CMD.cmd, CMD_SEGMENTS.skill);
    assert.equal(ECONOMY_CMD.cmd, CMD_SEGMENTS.economy);
    assert.equal(REALM_CMD.cmd, CMD_SEGMENTS.realm);
    assert.equal(COMBAT_CMD.cmd, CMD_SEGMENTS.combat);
    assert.equal(ZONE_CMD.cmd, CMD_SEGMENTS.zone);
    assert.equal(QUEST_CMD.cmd, CMD_SEGMENTS.quest);
    assert.equal(STORY_CMD.cmd, CMD_SEGMENTS.story);
    assert.equal(IDLE_CMD.cmd, CMD_SEGMENTS.idle);
  });
  test('每域 subCmd 唯一且 > 0', () => {
    const domains = { ITEM_CMD, PROP_CMD, EQUIP_CMD, SKILL_CMD, ECONOMY_CMD, REALM_CMD, COMBAT_CMD, ZONE_CMD, QUEST_CMD, STORY_CMD, IDLE_CMD } as const;
    for (const [name, spec] of Object.entries(domains)) {
      const subs = Object.entries(spec).filter(([k]) => k !== 'cmd').map(([, v]) => v as number);
      assert.equal(new Set(subs).size, subs.length, `${name} 存在重复 subCmd`);
      for (const sub of subs) assert.ok(sub > 0 && sub < 10, `${name} subCmd 越界: ${sub}`);
    }
  });
});

describe('PUBLIC_ACTION_KEYS 边界', () => {
  test('仅 system.ping 免鉴权', () => {
    assert.equal(PUBLIC_ACTION_KEYS.size, 1);
    assert.ok(PUBLIC_ACTION_KEYS.has(cmdMerge(SYSTEM_CMD.cmd, SYSTEM_CMD.ping)));
  });
  test('受保护路由不在白名单', () => {
    assert.equal(PUBLIC_ACTION_KEYS.has(cmdMerge(ITEM_CMD.cmd, ITEM_CMD.inventory)), false);
    assert.equal(PUBLIC_ACTION_KEYS.has(cmdMerge(0, 0)), false);
    assert.equal(PUBLIC_ACTION_KEYS.has(cmdMerge(1, 2)), false);
  });
});
