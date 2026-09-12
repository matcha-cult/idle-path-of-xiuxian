import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { QuestService } from '../../../src/modules/game/quest/quest.service.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';
import type { Character } from '../../../src/modules/character/character.service.js';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 11,
    userId: 7,
    nickname: '道友',
    gender: 'male',
    title: null,
    spiritStones: 0,
    silver: 0,
    realm: 3,
    lingyun: 100,
    jadeSlips: 0,
    ...overrides,
  };
}

function defRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: 'q1',
    chapter: 1,
    name: '任务一',
    trigger_type: 'auto',
    trigger_cond: '{}',
    objectives: '[]',
    rewards: '{}',
    dialogues: null as string | null,
    next_quest: null as string | null,
    order_index: 1,
    ...overrides,
  };
}

function makeService(opts: { db: FakeDatabase; character?: Character | null; counters?: Map<string, number> }) {
  const character = opts.character === undefined ? makeChar() : opts.character;
  const charStub = { findByUserId: stub(async () => character) };
  const statStub = {
    readAll: stub(async () => opts.counters ?? new Map<string, number>()),
    increment: stub(async () => undefined),
    recordKill: stub(async () => undefined),
  };
  const svc = new QuestService(opts.db as never, opts.db as never, charStub as never, statStub as never);
  return { svc, charStub, statStub };
}

interface QuestDbOptions {
  defs?: Array<Record<string, unknown>>;
  progress?: Array<Record<string, unknown>>;
  zones?: Array<Record<string, unknown>>;
  items?: string;
  skills?: string;
  insert?: Array<Record<string, unknown>>;
  pending?: Array<Record<string, unknown>>;
}

function questDb(opts: QuestDbOptions = {}): FakeDatabase {
  return new FakeDatabase()
    .on(/FROM game_quest_defs ORDER BY order_index, id/, { rows: opts.defs ?? [] })
    .on(/FROM game_quest_progress WHERE character_id = \$1/, { rows: opts.progress ?? [] })
    .on(/FROM game_zone_progress p JOIN game_zones z/, { rows: opts.zones ?? [] })
    .on(/COUNT\(\*\)::text AS c FROM game_items/, { rows: [{ c: opts.items ?? '0' }] })
    .on(/COUNT\(\*\)::text AS c FROM game_learned_skills/, { rows: [{ c: opts.skills ?? '0' }] })
    .on(/INSERT INTO game_quest_progress/, { rows: opts.insert ?? [] })
    .on(/d.rewards AS def_rewards/, { rows: opts.pending ?? [] });
}

function failingCode(res: { success: boolean; data?: unknown }): string | undefined {
  return (res.data as { code?: string } | undefined)?.code;
}

interface QuestView {
  code: string;
  status: string;
  claimable: boolean;
  objectives: Array<{ type: string; current: number; done: boolean }>;
}

// ===== list =====

describe('QuestService.list 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: questDb(), character: null });
    assert.equal(failingCode(await svc.list(7)), 'CHARACTER_NOT_FOUND');
  });

  test('无任务定义 -> total=0 / completed=0', async () => {
    const data = (await makeService({ db: questDb({ defs: [] }) }).svc.list(7)).data as { total: number; completed: number };
    assert.equal(data.total, 0);
    assert.equal(data.completed, 0);
  });

  test('trigger realm 未达 -> locked；达成 -> active', async () => {
    const defs = [
      defRow({ id: 1, code: 'locked', trigger_cond: '{"realm":10}' }),
      defRow({ id: 2, code: 'active', trigger_cond: '{"realm":1}' }),
    ];
    const data = (await makeService({ db: questDb({ defs }) }).svc.list(7)).data as { quests: QuestView[] };
    assert.equal(data.quests[0].status, 'locked');
    assert.equal(data.quests[1].status, 'active');
  });

  test('trigger.requires 前置未完成 -> locked；已完成 -> active', async () => {
    const defs = [
      defRow({ id: 1, code: 'q0', trigger_cond: '{}' }),
      defRow({ id: 2, code: 'q1', trigger_cond: '{"realm":1,"requires":["q0"]}' }),
    ];
    const pending = (await makeService({ db: questDb({ defs }) }).svc.list(7)).data as { quests: QuestView[] };
    assert.equal(pending.quests[1].status, 'locked');

    const done = (await makeService({
      db: questDb({
        defs,
        progress: [{ id: 1, character_id: 11, quest_code: 'q0', status: 'completed', objectives: null, completed_at: null, rewards_granted: true }],
      }),
    }).svc.list(7)).data as { quests: QuestView[] };
    assert.equal(done.quests[0].status, 'completed');
    assert.equal(done.quests[1].status, 'active');
  });

  test('objectives 全类型评估 + 未知类型', async () => {
    const objectives = [
      { type: 'reach_realm', value: 3 },
      { type: 'zone_best_floor', key: 'z1', value: 2 },
      { type: 'zone_cleared', key: 'z1' },
      { type: 'own_items', value: 5 },
      { type: 'learn_skills', value: 2 },
      { type: 'lingyun', value: 100 },
      { type: 'kill_total', value: 4 },
      { type: 'kill_unit', key: 'slime', value: 2 },
      { type: 'breakthrough_total', value: 1 },
      { type: 'craft_total', value: 1 },
      { type: 'unknown_type', value: 1 },
    ];
    const counters = new Map<string, number>([
      ['kill_total', 4],
      ['kill:slime', 2],
      ['breakthrough_total', 1],
      ['craft_total', 1],
    ]);
    const db = questDb({
      defs: [defRow({ code: 'q1', trigger_cond: '{"realm":1}', objectives: JSON.stringify(objectives) })],
      zones: [{ code: 'z1', best_floor: 2, cleared: true }],
      items: '5',
      skills: '2',
    });
    const data = (await makeService({ db, counters }).svc.list(7)).data as { quests: QuestView[] };
    assert.deepEqual(
      data.quests[0].objectives.map((o) => o.done),
      [true, true, true, true, true, true, true, true, true, true, false],
    );
    assert.equal(data.quests[0].objectives[10].current, 0);
    assert.equal(data.quests[0].claimable, false); // 未知目标未完成
  });

  test('active 且目标全完成 -> claimable=true；objectives 为空 -> claimable=false', async () => {
    const doneDef = defRow({ code: 'q1', trigger_cond: '{}', objectives: '[{"type":"reach_realm","value":1}]' });
    const emptyDef = defRow({ id: 2, code: 'q2', trigger_cond: '{}', objectives: '[]' });
    const data = (await makeService({ db: questDb({ defs: [doneDef, emptyDef] }) }).svc.list(7)).data as { quests: QuestView[] };
    assert.equal(data.quests[0].claimable, true);
    assert.equal(data.quests[1].claimable, false);
  });

  test('非法 JSON trigger/objectives -> 回退 {} / []（默认境界 1 触发）', async () => {
    const def = defRow({ code: 'q1', trigger_cond: 'not-json', objectives: 'not-json' });
    const data = (await makeService({ db: questDb({ defs: [def] }) }).svc.list(7)).data as { quests: QuestView[] };
    assert.equal(data.quests[0].status, 'active');
    assert.deepEqual(data.quests[0].objectives, []);
  });

  test('DB 抛错 -> 向上抛出', async () => {
    const db = new FakeDatabase().onFallback(() => {
      throw new Error('db down');
    });
    await assert.rejects(makeService({ db }).svc.list(7), /db down/);
  });
});

// ===== detail =====

describe('QuestService.detail 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: questDb(), character: null });
    assert.equal(failingCode(await svc.detail(7, 'q1')), 'CHARACTER_NOT_FOUND');
  });

  test('任务不存在（含空串）-> QUEST_NOT_FOUND', async () => {
    for (const code of ['nope', '']) {
      const { svc } = makeService({ db: questDb({ defs: [] }) });
      assert.equal(failingCode(await svc.detail(7, code)), 'QUEST_NOT_FOUND');
    }
  });

  test('详情返回 trigger/rewards/dialogues/nextQuest/completedAt', async () => {
    const def = defRow({ code: 'q1', trigger_cond: '{"realm":1}', rewards: '{"lingyun":5}', dialogues: '{"start":"S"}', next_quest: 'q2' });
    const db = questDb({
      defs: [def],
      progress: [{ id: 1, character_id: 11, quest_code: 'q1', status: 'completed', objectives: null, completed_at: '2024-01-01', rewards_granted: true }],
    });
    const data = (await makeService({ db }).svc.detail(7, 'q1')).data as {
      quest: { status: string; trigger: unknown; rewards: unknown; dialogues: unknown; nextQuest: string; completedAt: unknown; objectives: unknown[] };
    };
    assert.equal(data.quest.status, 'completed');
    assert.deepEqual(data.quest.trigger, { realm: 1 });
    assert.deepEqual(data.quest.rewards, { lingyun: 5 });
    assert.deepEqual(data.quest.dialogues, { start: 'S' });
    assert.equal(data.quest.nextQuest, 'q2');
    assert.equal(data.quest.completedAt, '2024-01-01');
  });

  test('非法 JSON -> trigger {} / rewards {} / dialogues null', async () => {
    const def = defRow({ code: 'q1', trigger_cond: 'x', rewards: 'y', dialogues: 'z' });
    const db = questDb({ defs: [def] });
    const data = (await makeService({ db }).svc.detail(7, 'q1')).data as { quest: { trigger: unknown; rewards: unknown; dialogues: unknown } };
    assert.deepEqual(data.quest.trigger, {});
    assert.deepEqual(data.quest.rewards, {});
    assert.equal(data.quest.dialogues, null);
  });
});

// ===== 发奖 bundle =====

describe('QuestService.grantRewardBundle 边界', () => {
  test('奖励全 0 / 空对象 -> 不写任何表', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db });
    await svc.grantRewardBundle(11, {});
    await svc.grantRewardBundle(11, { lingyun: 0, spiritStones: 0, jadeSlips: 0, currencies: {}, essences: {} });
    assert.equal(db.callCount, 0);
  });

  test('灵韵/灵石/玉简 -> 单条 UPDATE characters 且参数顺序正确', async () => {
    const db = new FakeDatabase();
    await makeService({ db }).svc.grantRewardBundle(11, { lingyun: 5, spiritStones: 3, jadeSlips: 2 });
    assert.equal(db.callCount, 1);
    assert.match(db.lastCall()?.sql ?? '', /UPDATE characters SET lingyun/);
    assert.deepEqual(db.lastCall()?.params, [5, 3, 2, 11]);
  });

  test('currencies / essences -> 分别逐条写钱包与精华库存', async () => {
    const db = new FakeDatabase();
    await makeService({ db }).svc.grantRewardBundle(11, {
      currencies: { gold: 2, gem: 4 },
      essences: { e1: 3 },
    });
    const wallets = db.callsMatching(/INSERT INTO game_wallets/);
    const essences = db.callsMatching(/INSERT INTO game_essence_inventory/);
    assert.equal(wallets.length, 2);
    assert.deepEqual(wallets[0].params, [11, 'gold', 2]);
    assert.deepEqual(wallets[1].params, [11, 'gem', 4]);
    assert.equal(essences.length, 1);
    assert.deepEqual(essences[0].params, [11, 'e1', 3]);
  });
});

// ===== sync =====

describe('QuestService.sync 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: questDb(), character: null });
    assert.equal(failingCode(await svc.sync(7)), 'CHARACTER_NOT_FOUND');
  });

  test('新完成 + 发放：写进度、汇总奖励、置 rewards_granted', async () => {
    const def = defRow({
      code: 'q1',
      trigger_cond: '{}',
      objectives: '[{"type":"reach_realm","value":1}]',
      rewards: '{"lingyun":5,"jadeSlips":1,"currencies":{"gold":2},"essences":{"e1":3}}',
    });
    const db = questDb({
      defs: [def],
      progress: [],
      insert: [{ id: 1 }],
      pending: [{ id: 1, character_id: 11, quest_code: 'q1', status: 'completed', objectives: null, completed_at: null, rewards_granted: false, def_rewards: '{"lingyun":5,"jadeSlips":1,"currencies":{"gold":2},"essences":{"e1":3}}', def_name: '任务一' }],
    });
    const res = await makeService({ db }).svc.sync(7);
    const data = res.data as {
      completedCount: number;
      completed: unknown[];
      granted: unknown[];
      totals: { lingyun: number; jadeSlips: number; currencies: Record<string, number>; essences: Record<string, number> };
    };
    assert.equal(data.completedCount, 1);
    assert.equal(data.completed.length, 1);
    assert.equal(data.granted.length, 1);
    assert.equal(data.totals.lingyun, 5);
    assert.equal(data.totals.jadeSlips, 1);
    assert.deepEqual(data.totals.currencies, { gold: 2 });
    assert.deepEqual(data.totals.essences, { e1: 3 });
    assert.equal(db.callsMatching(/UPDATE characters SET lingyun/).length, 1);
    assert.equal(db.callsMatching(/INSERT INTO game_wallets/).length, 1);
    assert.equal(db.callsMatching(/INSERT INTO game_essence_inventory/).length, 1);
    const upd = db.callsMatching(/UPDATE game_quest_progress SET rewards_granted/);
    assert.equal(upd.length, 1);
    assert.deepEqual(upd[0].params, [[1]]);
  });

  test('幂等：已 completed 且发过奖 -> 不新建、不重复发奖', async () => {
    const def = defRow({ code: 'q1', trigger_cond: '{}', objectives: '[{"type":"reach_realm","value":1}]', rewards: '{"lingyun":5}' });
    const db = questDb({
      defs: [def],
      progress: [{ id: 1, character_id: 11, quest_code: 'q1', status: 'completed', objectives: null, completed_at: null, rewards_granted: true }],
      pending: [],
    });
    const data = (await makeService({ db }).svc.sync(7)).data as { completedCount: number; granted: unknown[]; totals: { lingyun: number } };
    assert.equal(data.completedCount, 0);
    assert.equal(data.granted.length, 0);
    assert.equal(data.totals.lingyun, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_quest_progress/).length, 0);
    assert.equal(db.callsMatching(/UPDATE characters SET lingyun/).length, 0);
    assert.equal(db.callsMatching(/UPDATE game_quest_progress SET rewards_granted/).length, 0);
  });

  test('INSERT 冲突（ON CONFLICT DO NOTHING 0 行）-> 不计新完成，但未发奖会补发', async () => {
    const def = defRow({ code: 'q1', trigger_cond: '{}', objectives: '[{"type":"reach_realm","value":1}]', rewards: '{"lingyun":5}' });
    const db = questDb({
      defs: [def],
      progress: [],
      insert: [], // rowCount 0
      pending: [{ id: 1, character_id: 11, quest_code: 'q1', status: 'completed', objectives: null, completed_at: null, rewards_granted: false, def_rewards: '{"lingyun":5}', def_name: '任务一' }],
    });
    const data = (await makeService({ db }).svc.sync(7)).data as { completedCount: number; granted: unknown[]; totals: { lingyun: number } };
    assert.equal(data.completedCount, 0);
    assert.equal(data.granted.length, 1);
    assert.equal(data.totals.lingyun, 5);
    assert.equal(db.callsMatching(/UPDATE characters SET lingyun/).length, 1);
  });

  test('目标未完成 -> 不写进度、无发奖', async () => {
    const def = defRow({ code: 'q1', trigger_cond: '{}', objectives: '[{"type":"reach_realm","value":99}]', rewards: '{"lingyun":5}' });
    const db = questDb({ defs: [def], progress: [], pending: [] });
    const data = (await makeService({ db }).svc.sync(7)).data as { completedCount: number; totals: { lingyun: number } };
    assert.equal(data.completedCount, 0);
    assert.equal(data.totals.lingyun, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_quest_progress/).length, 0);
  });

  test('pending 多行汇总：灵韵/灵石/通货/精华累加', async () => {
    const row = (id: number, rewards: string, code: string) => ({
      id,
      character_id: 11,
      quest_code: code,
      status: 'completed',
      objectives: null,
      completed_at: null,
      rewards_granted: false,
      def_rewards: rewards,
      def_name: code,
    });
    const db = questDb({
      defs: [],
      progress: [{ id: 1, character_id: 11, quest_code: 'q1', status: 'completed', objectives: null, completed_at: null, rewards_granted: false }],
      pending: [row(1, '{"lingyun":5,"spiritStones":2,"currencies":{"gold":1}}', 'q1'), row(2, '{"lingyun":7,"spiritStones":1,"currencies":{"gold":3}}', 'q2')],
    });
    const data = (await makeService({ db }).svc.sync(7)).data as {
      granted: unknown[];
      totals: { lingyun: number; spiritStones: number; currencies: Record<string, number> };
    };
    assert.equal(data.granted.length, 2);
    assert.equal(data.totals.lingyun, 12);
    assert.equal(data.totals.spiritStones, 3);
    assert.deepEqual(data.totals.currencies, { gold: 4 });
    assert.deepEqual(db.lastCall(/UPDATE game_quest_progress SET rewards_granted/)?.params, [[1, 2]]);
  });
});
