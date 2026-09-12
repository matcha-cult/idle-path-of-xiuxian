/**
 * SkillService 单元测试（不使用 NestJS 容器）
 *
 * 构造：new SkillService(gameDb, userDb, characterService, rateLimiter)
 * - gameDb / userDb：FakeDatabase（按 SQL 正则分发）
 * - characterService / rateLimiter：stub
 *
 * 契约说明：玉简/灵韵的扣减依赖原子 SQL「UPDATE ... WHERE ... RETURNING」，
 * 「余额不足」等价于 RETURNING 无行——所以「恰好够 / 不足」不是算术分支，
 * 而是返回行数分支，下面用「返回 1 行 = 恰好够」「返回 0 行 = 不足」覆盖。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SkillService } from '../../src/modules/logic/skill/internal/skill.service.js';
import { APP_CONFIG } from '../../src/common/config/app-config.js';
import { PANEL_LIMITS } from '../../src/modules/logic/skill/internal/skill.types.js';
import { FakeDatabase } from '../helpers/fake-db.js';
import { stub } from '../helpers/stub.js';

const CHARACTER = {
  id: 5,
  userId: 7,
  nickname: '道友',
  gender: 'male',
  title: '散修',
  spiritStones: 1000,
  silver: 0,
  realm: 3,
  lingyun: 500,
  jadeSlips: 1,
};

function makeService(
  overrides: {
    gameDb?: FakeDatabase;
    userDb?: FakeDatabase;
    character?: typeof CHARACTER | null;
    allow?: boolean;
  } = {},
) {
  const gameDb = overrides.gameDb ?? new FakeDatabase();
  const userDb = overrides.userDb ?? new FakeDatabase();
  const characterService = {
    findByUserId: stub(() => (overrides.character === undefined ? CHARACTER : overrides.character)),
  };
  const rateLimiter = { allow: stub(() => overrides.allow ?? true) };
  const svc = new SkillService(
    gameDb as never,
    userDb as never,
    characterService as never,
    rateLimiter as never,
  );
  return { svc, gameDb, userDb, characterService, rateLimiter };
}

const dataOf = (res: unknown): any => (res as { data: any }).data;
const codeOf = (res: unknown): string => dataOf(res).code as string;

/** game_skills 行：默认为合法 JSON 效果、零成长 */
const xinfa = (id: number, code: string, spiritCost = 1, daoji = '剑') => ({
  id, code, name: code, skill_type: 'xinfa' as const, daoji, school: 's',
  spirit_cost: spiritCost, effects: '{}', growth_rate: 0, description: null,
});
const shufa = (id: number, code: string, spiritCost = 1, daoji = '剑') => ({
  id, code, name: code, skill_type: 'shufa' as const, daoji, school: 's',
  spirit_cost: spiritCost, effects: '{}', growth_rate: 0, description: null,
});
const learnedRow = (rowId: number, skillId: number, level: number) => ({
  id: rowId, character_id: CHARACTER.id, skill_id: skillId, level,
});

// SQL 分发正则（集中声明，避免相互误匹配）
const RE_SKILLS_ORDER = /FROM game_skills ORDER BY/;
const RE_SKILLS_BY_CODE = /FROM game_skills WHERE code =/;
const RE_SKILLS_BY_ID = /FROM game_skills WHERE id =/;
const RE_LEARNED = /FROM game_learned_skills/;
const RE_LEARNED_DUP = /FROM game_learned_skills WHERE character_id = \$1 AND skill_id = \$2/;
const RE_LEARNED_ANY = /skill_id = ANY/;
const RE_INSERT_LEARNED = /INSERT INTO game_learned_skills/;
const RE_UPDATE_LEARNED = /UPDATE game_learned_skills/;
const RE_PANEL_SELECT = /FROM game_skill_panels/;
const RE_PANEL_UPSERT = /INSERT INTO game_skill_panels/;
const RE_JADE_MINUS = /jade_slips = jade_slips - 1/;
const RE_JADE_PLUS = /jade_slips = jade_slips \+ 1/;
const RE_JADE_GRANT = /UPDATE characters SET jade_slips = jade_slips \+/;
const RE_LINGYUN_MINUS = /lingyun = lingyun -/;
const RE_LINGYUN_PLUS = /lingyun = lingyun \+/;

// =====================================================================
describe('SkillService.catalog 边界', () => {
  test('角色不存在 -> CHARACTER_NOT_FOUND，且不触达任何库', async () => {
    const { svc, gameDb, userDb } = makeService({ character: null });
    const res = await svc.catalog(7);
    assert.equal(res.success, false);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(gameDb.callCount, 0);
    assert.equal(userDb.callCount, 0);
  });

  test('空表 -> skills=[]', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_ORDER, { rows: [] })
      .on(RE_LEARNED, { rows: [] });
    const { svc } = makeService({ gameDb });
    const res = await svc.catalog(7);
    assert.equal(res.success, true);
    assert.deepEqual(dataOf(res).skills, []);
  });

  test('多行：已修习/未修习、等级、成长倍率、百分比、未知键、非法 JSON 回退', async () => {
    const rows = [
      {
        id: 1, code: 'a', name: '金剑诀', skill_type: 'xinfa', daoji: '剑', school: 'x',
        spirit_cost: '10', effects: '{"atk":10}', growth_rate: 0.5, description: null,
      },
      {
        id: 2, code: 'b', name: '烈火术', skill_type: 'shufa', daoji: '火', school: 'y',
        spirit_cost: 20, effects: '{"crit":5,"mystery":7}', growth_rate: 0, description: 'desc',
      },
      {
        id: 3, code: 'c', name: '残卷', skill_type: 'shufa', daoji: '火', school: 'y',
        spirit_cost: 0, effects: 'not-json', growth_rate: 0, description: null,
      },
    ];
    const learned = [learnedRow(9, 1, 3)];
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_ORDER, { rows })
      .on(RE_LEARNED, { rows: learned });
    const { svc } = makeService({ gameDb });

    const skills = dataOf(await svc.catalog(7)).skills;

    assert.equal(skills.length, 3);
    // 已修习：level 3，growth 0.5 -> mul = 1 + 0.5*(3-1) = 2
    assert.equal(skills[0].learned, true);
    assert.equal(skills[0].level, 3);
    assert.equal(skills[0].spiritCost, 10); // 字符串 -> number
    assert.deepEqual(skills[0].effectsTexts, ['攻击 20（3级 效果）']);
    assert.equal(skills[0].description, '');
    // 未修习：level 展示 null，但效果文本按默认 1 级渲染
    assert.equal(skills[1].learned, false);
    assert.equal(skills[1].level, null);
    assert.deepEqual(skills[1].effectsTexts, ['暴击 5%（1级 效果）', 'mystery 7（1级 效果）']);
    assert.equal(skills[1].description, 'desc');
    // 非法 JSON -> 回退 {}，无效果文本
    assert.deepEqual(skills[2].effectsTexts, []);
  });
});

// =====================================================================
describe('SkillService.learn 边界', () => {
  test('角色不存在 -> CHARACTER_NOT_FOUND', async () => {
    const { svc, gameDb, userDb } = makeService({ character: null });
    const res = await svc.learn(7, 1);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(gameDb.callCount, 0);
    assert.equal(userDb.callCount, 0);
  });

  test('skillId 不存在 -> SKILL_NOT_FOUND，不扣玉简', async () => {
    const gameDb = new FakeDatabase().on(RE_SKILLS_BY_ID, { rows: [] });
    const { svc, userDb } = makeService({ gameDb });
    const res = await svc.learn(7, 999);
    assert.equal(codeOf(res), 'SKILL_NOT_FOUND');
    assert.equal(userDb.callCount, 0);
  });

  test('已修习（重复学习）-> ALREADY_LEARNED，不扣玉简', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1 }] })
      .on(RE_LEARNED_DUP, { rows: [{ id: 3 }] });
    const { svc, userDb } = makeService({ gameDb });
    const res = await svc.learn(7, 1);
    assert.equal(codeOf(res), 'ALREADY_LEARNED');
    assert.equal(userDb.callCount, 0);
  });

  test('玉简为 0（扣减 UPDATE 无行）-> JADE_NOT_ENOUGH，不插入也不补偿', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1 }] })
      .on(RE_LEARNED_DUP, { rows: [] })
      .on(RE_INSERT_LEARNED, { rows: [{ id: 11 }] });
    const userDb = new FakeDatabase().on(RE_JADE_MINUS, { rows: [] });
    const { svc } = makeService({ gameDb, userDb });

    const res = await svc.learn(7, 1);

    assert.equal(codeOf(res), 'JADE_NOT_ENOUGH');
    assert.equal(gameDb.callsMatching(RE_INSERT_LEARNED).length, 0);
    assert.equal(userDb.callsMatching(RE_JADE_PLUS).length, 0);
  });

  test('恰好 1 枚 -> 成功，返回扣后余量 0，SQL 参数正确', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1 }] })
      .on(RE_LEARNED_DUP, { rows: [] })
      .on(RE_INSERT_LEARNED, { rows: [{ id: 11 }] });
    const userDb = new FakeDatabase().on(RE_JADE_MINUS, { rows: [{ jade_slips: '0' }] });
    const { svc } = makeService({ gameDb, userDb });

    const res = await svc.learn(7, 1);

    assert.equal(res.success, true);
    assert.equal(dataOf(res).skillId, 1);
    assert.equal(dataOf(res).jadeSlips, 0);
    assert.deepEqual(userDb.lastCall(RE_JADE_MINUS)?.params, [CHARACTER.id]);
    assert.deepEqual(gameDb.lastCall(RE_INSERT_LEARNED)?.params, [CHARACTER.id, 1]);
  });

  test('并发竞态（INSERT ON CONFLICT 无行）-> 退还玉简 +1 且报 ALREADY_LEARNED', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1 }] })
      .on(RE_LEARNED_DUP, { rows: [] })
      .on(RE_INSERT_LEARNED, { rows: [] });
    const userDb = new FakeDatabase()
      .on(RE_JADE_MINUS, { rows: [{ jade_slips: '0' }] })
      .on(RE_JADE_PLUS, { rows: [] });
    const { svc } = makeService({ gameDb, userDb });

    const res = await svc.learn(7, 1);

    assert.equal(codeOf(res), 'ALREADY_LEARNED');
    assert.deepEqual(userDb.lastCall(RE_JADE_PLUS)?.params, [CHARACTER.id]);
  });

  test('INSERT 抛错 -> 补偿 +1 后原样抛出', async () => {
    const boom = new Error('db down');
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1 }] })
      .on(RE_LEARNED_DUP, { rows: [] })
      .on(RE_INSERT_LEARNED, () => {
        throw boom;
      });
    const userDb = new FakeDatabase().on(RE_JADE_MINUS, { rows: [{ jade_slips: '0' }] });
    const { svc } = makeService({ gameDb, userDb });

    await assert.rejects(() => svc.learn(7, 1), (err: unknown) => err === boom);
    assert.deepEqual(userDb.lastCall(RE_JADE_PLUS)?.params, [CHARACTER.id]);
  });
});

// =====================================================================
describe('SkillService.getPanel 边界', () => {
  test('角色不存在 -> CHARACTER_NOT_FOUND', async () => {
    const { svc, gameDb } = makeService({ character: null });
    const res = await svc.getPanel(7);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(gameDb.callCount, 0);
  });

  test('无面板行 -> 空面板视图，且不查 game_skills', async () => {
    const gameDb = new FakeDatabase().on(RE_PANEL_SELECT, { rows: [] });
    const { svc } = makeService({ gameDb });
    const res = await svc.getPanel(7);
    assert.equal(res.success, true);
    const panel = dataOf(res).panel;
    assert.deepEqual(panel.xinfa, { main: null, mainInfo: null, aux: [] });
    assert.deepEqual(panel.shufa, []);
    assert.equal(panel.spiritUsed, 0);
    assert.equal(panel.spiritBudget, APP_CONFIG.spiritBudget);
    assert.equal(panel.mainDaoji, null);
    assert.equal(gameDb.callsMatching(RE_SKILLS_BY_CODE).length, 0);
  });

  test('slots 非法 JSON -> 回退空面板', async () => {
    const gameDb = new FakeDatabase().on(RE_PANEL_SELECT, { rows: [{ slots: '{bad json' }] });
    const { svc } = makeService({ gameDb });
    const panel = dataOf(await svc.getPanel(7)).panel;
    assert.deepEqual(panel.xinfa, { main: null, mainInfo: null, aux: [] });
    assert.deepEqual(panel.shufa, []);
  });

  test('完整面板：主心法信息 / 辅神识合计 / 道基协同', async () => {
    const slots = { xinfa: { main: 'a', aux: ['b', 'c'] }, shufa: ['d', 'e'] };
    const skills = [
      xinfa(1, 'a', 10, '剑'),
      xinfa(2, 'b', 30, '火'),
      xinfa(3, 'c', 5, '剑'),
      shufa(4, 'd', 1, '剑'),
      shufa(5, 'e', 1, '火'),
    ];
    const gameDb = new FakeDatabase()
      .on(RE_PANEL_SELECT, { rows: [{ slots: JSON.stringify(slots) }] })
      .on(RE_SKILLS_BY_CODE, { rows: skills });
    const { svc } = makeService({ gameDb });

    const panel = dataOf(await svc.getPanel(7)).panel;

    assert.equal(panel.xinfa.main, 'a');
    assert.equal(panel.xinfa.mainInfo.name, 'a');
    assert.equal(panel.xinfa.aux.length, 2);
    assert.equal(panel.spiritUsed, 35); // 只累计辅心法 30 + 5
    assert.equal(panel.spiritBudget, APP_CONFIG.spiritBudget);
    assert.equal(panel.mainDaoji, '剑');
    assert.equal(panel.shufa[0].synergy.matched, true); // d 与主心法同剑
    assert.match(panel.shufa[0].synergy.text, /道基协同/);
    assert.equal(panel.shufa[1].synergy.matched, false);
    assert.equal(panel.shufa[1].synergy.text, '');
  });

  test('面板引用了已删除/未知 code -> info 为 null，不抛错', async () => {
    const slots = { xinfa: { main: 'ghost', aux: [] }, shufa: [] };
    const gameDb = new FakeDatabase()
      .on(RE_PANEL_SELECT, { rows: [{ slots: JSON.stringify(slots) }] })
      .on(RE_SKILLS_BY_CODE, { rows: [] });
    const { svc } = makeService({ gameDb });
    const panel = dataOf(await svc.getPanel(7)).panel;
    assert.equal(panel.xinfa.main, 'ghost');
    assert.equal(panel.xinfa.mainInfo, null);
    assert.equal(panel.mainDaoji, null);
  });
});

// =====================================================================
describe('SkillService.putPanel 边界', () => {
  test('角色不存在 -> CHARACTER_NOT_FOUND', async () => {
    const { svc, gameDb } = makeService({ character: null });
    const res = await svc.putPanel(7, {});
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(gameDb.callCount, 0);
  });

  const invalidBodies: unknown[] = [null, undefined, 42, 'x', true, [], [1], { xinfa: 5 }, { xinfa: 'x' }, { xinfa: true }];
  for (const body of invalidBodies) {
    test('非法结构 body=' + JSON.stringify(body) + ' -> SLOTS_INVALID', async () => {
      const { svc, gameDb } = makeService();
      const res = await svc.putPanel(7, body);
      assert.equal(codeOf(res), 'SLOTS_INVALID');
      assert.equal(gameDb.callCount, 0);
    });
  }

  test('xinfa 为数组不被显式拒绝（typeof [] === object），按空面板处理', async () => {
    // 记录现状：结构校验只排除非 object 的 xinfa，[] 会走「无 main/aux」的空面板分支。
    const gameDb = new FakeDatabase()
      .on(RE_LEARNED_ANY, { rows: [] })
      .on(RE_PANEL_UPSERT, { rows: [] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, { xinfa: [] });
    assert.equal(res.success, true);
    const upsert = gameDb.lastCall(RE_PANEL_UPSERT);
    assert.deepEqual(upsert?.params, [CHARACTER.id, JSON.stringify({ xinfa: { main: null, aux: [] }, shufa: [] })]);
  });

  test('body={} -> 成功写入空面板', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_LEARNED_ANY, { rows: [] })
      .on(RE_PANEL_UPSERT, { rows: [] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, {});
    assert.equal(res.success, true);
    assert.deepEqual(dataOf(res).panel.xinfa, { main: null, mainInfo: null, aux: [] });
  });

  test('辅心法超过 PANEL_LIMITS.aux -> SLOT_COUNT_EXCEEDED，不查库', async () => {
    const { svc, gameDb } = makeService();
    const res = await svc.putPanel(7, {
      xinfa: { aux: Array.from({ length: PANEL_LIMITS.aux + 1 }, (_, i) => 'a' + i) },
    });
    assert.equal(codeOf(res), 'SLOT_COUNT_EXCEEDED');
    assert.equal(gameDb.callCount, 0);
  });

  test('术法超过 PANEL_LIMITS.shufa -> SLOT_COUNT_EXCEEDED，不查库', async () => {
    const { svc, gameDb } = makeService();
    const res = await svc.putPanel(7, {
      shufa: Array.from({ length: PANEL_LIMITS.shufa + 1 }, (_, i) => 's' + i),
    });
    assert.equal(codeOf(res), 'SLOT_COUNT_EXCEEDED');
    assert.equal(gameDb.callCount, 0);
  });

  test('辅心法内部重复 code -> DUPLICATE_SLOT', async () => {
    const { svc, gameDb } = makeService();
    const res = await svc.putPanel(7, { xinfa: { aux: ['a', 'a'] } });
    assert.equal(codeOf(res), 'DUPLICATE_SLOT');
    assert.equal(gameDb.callCount, 0);
  });

  test('术法内部重复 code -> DUPLICATE_SLOT', async () => {
    const { svc, gameDb } = makeService();
    const res = await svc.putPanel(7, { shufa: ['d', 'd'] });
    assert.equal(codeOf(res), 'DUPLICATE_SLOT');
    assert.equal(gameDb.callCount, 0);
  });

  test('主心法与辅心法占用同一槽 -> DUPLICATE_SLOT', async () => {
    const { svc, gameDb } = makeService();
    const res = await svc.putPanel(7, { xinfa: { main: 'a', aux: ['a'] } });
    assert.equal(codeOf(res), 'DUPLICATE_SLOT');
    assert.equal(gameDb.callCount, 0);
  });

  test('trim 后重复也要拒绝（前后空白归一）', async () => {
    const { svc, gameDb } = makeService();
    const res = await svc.putPanel(7, { xinfa: { aux: [' a ', 'a'] } });
    assert.equal(codeOf(res), 'DUPLICATE_SLOT');
    assert.equal(gameDb.callCount, 0);
  });

  test('未知 skill code -> SKILL_NOT_FOUND', async () => {
    const gameDb = new FakeDatabase().on(RE_SKILLS_BY_CODE, { rows: [] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, { xinfa: { main: 'nope' } });
    assert.equal(codeOf(res), 'SKILL_NOT_FOUND');
  });

  test('主心法槽位放入术法 -> SLOTS_INVALID', async () => {
    const gameDb = new FakeDatabase().on(RE_SKILLS_BY_CODE, { rows: [shufa(1, 'd')] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, { xinfa: { main: 'd' } });
    assert.equal(codeOf(res), 'SLOTS_INVALID');
  });

  test('辅心法槽位放入术法 -> SLOTS_INVALID', async () => {
    const gameDb = new FakeDatabase().on(RE_SKILLS_BY_CODE, { rows: [shufa(1, 'd')] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, { xinfa: { aux: ['d'] } });
    assert.equal(codeOf(res), 'SLOTS_INVALID');
  });

  test('术法槽位放入心法 -> SLOTS_INVALID', async () => {
    const gameDb = new FakeDatabase().on(RE_SKILLS_BY_CODE, { rows: [xinfa(1, 'a')] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, { shufa: ['a'] });
    assert.equal(codeOf(res), 'SLOTS_INVALID');
  });

  test('功法存在且类型正确但未修习 -> NOT_LEARNED', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_CODE, { rows: [xinfa(1, 'a')] })
      .on(RE_LEARNED_ANY, { rows: [] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, { xinfa: { main: 'a' } });
    assert.equal(codeOf(res), 'NOT_LEARNED');
  });

  test('辅心法神识合计超预算 -> SPIRIT_BUDGET_EXCEEDED', async () => {
    const per = Math.floor(APP_CONFIG.spiritBudget / 2) + 1; // 保证 2 个即超预算
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_CODE, { rows: [xinfa(1, 'a', per), xinfa(2, 'b', per)] })
      .on(RE_LEARNED_ANY, { rows: [{ skill_id: 1 }, { skill_id: 2 }] });
    const { svc } = makeService({ gameDb });
    const res = await svc.putPanel(7, { xinfa: { aux: ['a', 'b'] } });
    assert.equal(codeOf(res), 'SPIRIT_BUDGET_EXCEEDED');
    assert.match(res.message, new RegExp(String(APP_CONFIG.spiritBudget)));
  });

  test('合法满槽（1 主 + 上限辅 + 上限术法）-> 写库并返回视图', async () => {
    const skills = [
      xinfa(1, 'm', 1, '剑'),
      xinfa(2, 'a1', 1, '剑'),
      xinfa(3, 'a2', 1, '剑'),
      xinfa(4, 'a3', 1, '剑'),
      shufa(5, 's1', 1, '剑'),
      shufa(6, 's2', 1, '剑'),
      shufa(7, 's3', 1, '剑'),
      shufa(8, 's4', 1, '剑'),
      shufa(9, 's5', 1, '剑'),
    ];
    const learned = skills.map((s) => ({ skill_id: s.id }));
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_CODE, { rows: skills })
      .on(RE_LEARNED_ANY, { rows: learned })
      .on(RE_PANEL_UPSERT, { rows: [] });
    const { svc } = makeService({ gameDb });
    const payload = {
      xinfa: { main: 'm', aux: ['a1', 'a2', 'a3'] },
      shufa: ['s1', 's2', 's3', 's4', 's5'],
    };

    const res = await svc.putPanel(7, payload);

    assert.equal(res.success, true);
    assert.deepEqual(gameDb.lastCall(RE_PANEL_UPSERT)?.params, [CHARACTER.id, JSON.stringify(payload)]);
    assert.equal(dataOf(res).panel.spiritUsed, 3);
    assert.equal(dataOf(res).panel.shufa.length, 5);
  });

  test('归一化：trim 去空白、过滤空串与非字符串', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_CODE, { rows: [xinfa(1, 'm'), xinfa(2, 'a1')] })
      .on(RE_LEARNED_ANY, { rows: [{ skill_id: 1 }, { skill_id: 2 }] })
      .on(RE_PANEL_UPSERT, { rows: [] });
    const { svc } = makeService({ gameDb });

    const res = await svc.putPanel(7, {
      xinfa: { main: '  m  ', aux: [' a1 ', '', '   ', 5, null, undefined] },
      shufa: 'not-array',
    });

    assert.equal(res.success, true);
    assert.deepEqual(
      gameDb.lastCall(RE_PANEL_UPSERT)?.params,
      [CHARACTER.id, JSON.stringify({ xinfa: { main: 'm', aux: ['a1'] }, shufa: [] })],
    );
  });
});

// =====================================================================
describe('SkillService.enlighten 边界', () => {
  test('角色不存在 -> CHARACTER_NOT_FOUND', async () => {
    const { svc, gameDb, userDb } = makeService({ character: null });
    const res = await svc.enlighten(7, 1);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(gameDb.callCount, 0);
    assert.equal(userDb.callCount, 0);
  });

  test('skillId 不存在 -> SKILL_NOT_FOUND', async () => {
    const gameDb = new FakeDatabase().on(RE_SKILLS_BY_ID, { rows: [] });
    const { svc, userDb } = makeService({ gameDb });
    const res = await svc.enlighten(7, 999);
    assert.equal(codeOf(res), 'SKILL_NOT_FOUND');
    assert.equal(userDb.callCount, 0);
  });

  test('未修习 -> NOT_LEARNED', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1, name: 'x' }] })
      .on(RE_LEARNED_DUP, { rows: [] });
    const { svc, userDb } = makeService({ gameDb });
    const res = await svc.enlighten(7, 1);
    assert.equal(codeOf(res), 'NOT_LEARNED');
    assert.equal(userDb.callCount, 0);
  });

  test('等级 == maxSkillLevel -> MAX_LEVEL_REACHED，不扣灵韵', async () => {
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1, name: 'x' }] })
      .on(RE_LEARNED_DUP, { rows: [learnedRow(9, 1, APP_CONFIG.maxSkillLevel)] });
    const { svc, userDb } = makeService({ gameDb });
    const res = await svc.enlighten(7, 1);
    assert.equal(codeOf(res), 'MAX_LEVEL_REACHED');
    assert.equal(userDb.callCount, 0);
  });

  test('等级 == maxSkillLevel - 1 -> 成功升到上限，cost = base × 当前等级', async () => {
    const level = APP_CONFIG.maxSkillLevel - 1;
    const cost = APP_CONFIG.enlightenBaseCost * level;
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1, name: '金剑诀' }] })
      .on(RE_LEARNED_DUP, { rows: [learnedRow(9, 1, level)] })
      .on(RE_UPDATE_LEARNED, { rows: [{ level: APP_CONFIG.maxSkillLevel }] });
    const userDb = new FakeDatabase().on(RE_LINGYUN_MINUS, { rows: [{ lingyun: '0' }] });
    const { svc } = makeService({ gameDb, userDb });

    const res = await svc.enlighten(7, 1);

    assert.equal(res.success, true);
    assert.equal(dataOf(res).skillId, 1);
    assert.equal(dataOf(res).level, APP_CONFIG.maxSkillLevel);
    assert.deepEqual(userDb.lastCall(RE_LINGYUN_MINUS)?.params, [cost, CHARACTER.id]);
    assert.deepEqual(gameDb.lastCall(RE_UPDATE_LEARNED)?.params, [9]);
  });

  test('恰好够（扣减 RETURNING 有行）-> 成功', async () => {
    const cost = APP_CONFIG.enlightenBaseCost * 1;
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1, name: 'x' }] })
      .on(RE_LEARNED_DUP, { rows: [learnedRow(9, 1, 1)] })
      .on(RE_UPDATE_LEARNED, { rows: [{ level: 2 }] });
    const userDb = new FakeDatabase().on(RE_LINGYUN_MINUS, { rows: [{ lingyun: '0' }] });
    const { svc } = makeService({ gameDb, userDb });

    const res = await svc.enlighten(7, 1);

    assert.equal(res.success, true);
    assert.equal(dataOf(res).level, 2);
    assert.deepEqual(userDb.lastCall(RE_LINGYUN_MINUS)?.params, [cost, CHARACTER.id]);
  });

  test('灵韵不足（扣减 RETURNING 无行）-> LINGYUN_NOT_ENOUGH，消息含所需与当前，且不升级', async () => {
    const level = 5;
    const cost = APP_CONFIG.enlightenBaseCost * level;
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1, name: 'x' }] })
      .on(RE_LEARNED_DUP, { rows: [learnedRow(9, 1, level)] })
      .on(RE_UPDATE_LEARNED, { rows: [{ level: level + 1 }] });
    const userDb = new FakeDatabase().on(RE_LINGYUN_MINUS, { rows: [] });
    const { svc } = makeService({ gameDb, userDb });

    const res = await svc.enlighten(7, 1);

    assert.equal(codeOf(res), 'LINGYUN_NOT_ENOUGH');
    assert.match(res.message, new RegExp(String(cost)));
    assert.match(res.message, new RegExp(String(CHARACTER.lingyun)));
    assert.equal(gameDb.callsMatching(RE_UPDATE_LEARNED).length, 0);
  });

  test('升级返回无行 -> 补偿灵韵并抛错', async () => {
    const level = 2;
    const cost = APP_CONFIG.enlightenBaseCost * level;
    const gameDb = new FakeDatabase()
      .on(RE_SKILLS_BY_ID, { rows: [{ id: 1, name: 'x' }] })
      .on(RE_LEARNED_DUP, { rows: [learnedRow(9, 1, level)] })
      .on(RE_UPDATE_LEARNED, { rows: [] });
    const userDb = new FakeDatabase().on(RE_LINGYUN_MINUS, { rows: [{ lingyun: '0' }] });
    const { svc } = makeService({ gameDb, userDb });

    await assert.rejects(() => svc.enlighten(7, 1));
    assert.deepEqual(userDb.lastCall(RE_LINGYUN_PLUS)?.params, [cost, CHARACTER.id]);
  });
});

// =====================================================================
describe('SkillService.grantLingyun / grantJade 边界', () => {
  test('角色不存在 -> CHARACTER_NOT_FOUND（不触达限流）', async () => {
    const { svc, rateLimiter, userDb } = makeService({ character: null });
    const res = await svc.grantLingyun(7, 10);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(rateLimiter.allow.callCount, 0);
    assert.equal(userDb.callCount, 0);
  });

  test('限流拒绝 -> RATE_LIMITED（不写库），allow 收到配置额度', async () => {
    const { svc, rateLimiter, userDb } = makeService({ allow: false });
    const res = await svc.grantLingyun(7, 10);
    assert.equal(codeOf(res), 'RATE_LIMITED');
    assert.deepEqual(rateLimiter.allow.last, [7, APP_CONFIG.devToolRateLimitPerMinute]);
    assert.equal(userDb.callCount, 0);
  });

  const invalidLingyun: Array<[string, number]> = [
    ['0', 0],
    ['负数', -1],
    ['大负数', -100],
    ['小数', 1.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['上界+1', 1_000_001],
    ['MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER],
  ];
  for (const [label, amount] of invalidLingyun) {
    test('grantLingyun amount=' + label + ' (' + String(amount) + ') -> INVALID_PARAM', async () => {
      const { svc, userDb } = makeService();
      const res = await svc.grantLingyun(7, amount);
      assert.equal(codeOf(res), 'INVALID_PARAM');
      assert.equal(userDb.callCount, 0);
    });
  }

  test('grantLingyun 合法上下界 1 / 1000000 -> 成功且 SQL 参数正确', async () => {
    for (const amount of [1, 1_000_000]) {
      const userDb = new FakeDatabase().on(RE_LINGYUN_PLUS, { rows: [{ lingyun: String(amount) }] });
      const { svc } = makeService({ userDb });
      const res = await svc.grantLingyun(7, amount);
      assert.equal(res.success, true);
      assert.equal(dataOf(res).lingyun, amount);
      assert.deepEqual(userDb.lastCall(RE_LINGYUN_PLUS)?.params, [amount, CHARACTER.id]);
    }
  });

  test('grantJade 角色不存在 -> CHARACTER_NOT_FOUND', async () => {
    const { svc, rateLimiter } = makeService({ character: null });
    const res = await svc.grantJade(7, 1);
    assert.equal(codeOf(res), 'CHARACTER_NOT_FOUND');
    assert.equal(rateLimiter.allow.callCount, 0);
  });

  test('grantJade 限流拒绝 -> RATE_LIMITED', async () => {
    const { svc, userDb } = makeService({ allow: false });
    const res = await svc.grantJade(7, 1);
    assert.equal(codeOf(res), 'RATE_LIMITED');
    assert.equal(userDb.callCount, 0);
  });

  const invalidJade: Array<[string, number]> = [
    ['0', 0],
    ['负数', -1],
    ['小数', 2.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['上界+1', 101],
    ['MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER],
  ];
  for (const [label, count] of invalidJade) {
    test('grantJade count=' + label + ' (' + String(count) + ') -> INVALID_PARAM', async () => {
      const { svc, userDb } = makeService();
      const res = await svc.grantJade(7, count);
      assert.equal(codeOf(res), 'INVALID_PARAM');
      assert.equal(userDb.callCount, 0);
    });
  }

  test('grantJade 合法上下界 1 / 100 -> 成功且 SQL 参数正确', async () => {
    for (const count of [1, 100]) {
      const userDb = new FakeDatabase().on(RE_JADE_GRANT, { rows: [{ jade_slips: String(count) }] });
      const { svc } = makeService({ userDb });
      const res = await svc.grantJade(7, count);
      assert.equal(res.success, true);
      assert.equal(dataOf(res).jadeSlips, count);
      assert.deepEqual(userDb.lastCall(RE_JADE_GRANT)?.params, [count, CHARACTER.id]);
    }
  });
});

// =====================================================================
async function withProductionEnv(fn: () => Promise<void>): Promise<void> {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await fn();
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
}

describe('SkillService 开发接口生产门禁（NODE_ENV=production）', () => {
  test('grantLingyun -> FORBIDDEN，且不解析角色、不限流、不写库', async () => {
    await withProductionEnv(async () => {
      const { svc, gameDb, userDb, characterService, rateLimiter } = makeService();
      const res = await svc.grantLingyun(7, 10);
      assert.equal(res.success, false);
      assert.equal(codeOf(res), 'FORBIDDEN');
      assert.equal(characterService.findByUserId.callCount, 0);
      assert.equal(rateLimiter.allow.callCount, 0);
      assert.equal(gameDb.callCount, 0);
      assert.equal(userDb.callCount, 0);
    });
  });

  test('grantJade -> FORBIDDEN，且不解析角色、不限流、不写库', async () => {
    await withProductionEnv(async () => {
      const { svc, userDb, characterService, rateLimiter } = makeService();
      const res = await svc.grantJade(7, 1);
      assert.equal(res.success, false);
      assert.equal(codeOf(res), 'FORBIDDEN');
      assert.equal(characterService.findByUserId.callCount, 0);
      assert.equal(rateLimiter.allow.callCount, 0);
      assert.equal(userDb.callCount, 0);
    });
  });

  test('非 production（development）下门禁放行', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const userDb = new FakeDatabase().on(RE_LINGYUN_PLUS, { rows: [{ lingyun: '10' }] });
      const { svc } = makeService({ userDb });
      const res = await svc.grantLingyun(7, 10);
      assert.equal(res.success, true);
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });
});
