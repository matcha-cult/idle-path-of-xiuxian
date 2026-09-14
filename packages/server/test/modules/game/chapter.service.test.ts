import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ChapterService } from '../../../src/modules/logic/quest/internal/chapter.service.js';
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

function chapterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: 'c1',
    chapter: 1,
    name: '第一章',
    theme: null as string | null,
    min_realm: 1,
    zone_code: 'z1',
    quest_start_code: 'q1',
    quest_end_code: 'q2',
    requires_chapter: null as string | null,
    rewards: '{}',
    dialogues: null as string | null,
    order_index: 1,
    ...overrides,
  };
}

interface QuestListResult {
  success: boolean;
  message: string;
  data?: unknown;
}

function makeService(opts: { db: FakeDatabase; character?: Character | null; questList?: QuestListResult }) {
  const character = opts.character === undefined ? makeChar() : opts.character;
  const charStub = { findByUserId: stub(async () => character) };
  const questStub = {
    list: stub(async () => opts.questList ?? { success: true, message: '', data: { quests: [] } }),
    grantRewardBundle: stub(async () => undefined),
  };
  const svc = new ChapterService(opts.db as never, charStub as never, questStub as never);
  return { svc, charStub, questStub };
}

interface ChapterDbOptions {
  chapters?: Array<Record<string, unknown>>;
  chapterProgress?: Array<Record<string, unknown>>;
  questProgress?: Array<Record<string, unknown>>;
  questDefs?: Array<Record<string, unknown>>;
  detailQuests?: Array<Record<string, unknown>>;
  zone?: Array<Record<string, unknown>>;
  insert?: Array<Record<string, unknown>>;
  pending?: Array<Record<string, unknown>>;
}

function chapterDb(opts: ChapterDbOptions = {}): FakeDatabase {
  return new FakeDatabase()
    .on(/FROM game_chapters ORDER BY order_index, id/, { rows: opts.chapters ?? [] })
    .on(/FROM game_chapter_progress WHERE character_id = \$1/, { rows: opts.chapterProgress ?? [] })
    .on(/FROM game_quest_progress WHERE character_id = \$1/, { rows: opts.questProgress ?? [] })
    .on(/SELECT code, chapter FROM game_quest_defs/, { rows: opts.questDefs ?? [] })
    .on(/SELECT code, name, order_index FROM game_quest_defs WHERE chapter/, { rows: opts.detailQuests ?? [] })
    .on(/SELECT code, name FROM game_zones WHERE code/, { rows: opts.zone ?? [] })
    .on(/INSERT INTO game_chapter_progress/, { rows: opts.insert ?? [] })
    .on(/c.rewards AS def_rewards/, { rows: opts.pending ?? [] });
}

function failingCode(res: { success: boolean; data?: unknown }): string | undefined {
  return (res.data as { code?: string } | undefined)?.code;
}

interface ChapterView {
  code: string;
  unlocked: boolean;
  unlockedReason: string;
  completed: boolean;
  quests: { total: number; completed: number };
}

// ===== list =====

describe('ChapterService.list 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: chapterDb(), character: null });
    assert.equal(failingCode(await svc.list(7)), 'CHARACTER_NOT_FOUND');
  });

  test('无章节 -> total=0 / currentChapter=null', async () => {
    const data = (await makeService({ db: chapterDb({ chapters: [] }) }).svc.list(7)).data as { total: number; currentChapter: number | null };
    assert.equal(data.total, 0);
    assert.equal(data.currentChapter, null);
  });

  test('解锁：realm 边界 + 前置链未完成/已完成', async () => {
    const c0 = chapterRow({ id: 1, code: 'c0', chapter: 1, min_realm: 1, requires_chapter: null, order_index: 1 });
    const c1 = chapterRow({ id: 2, code: 'c1', chapter: 2, min_realm: 2, requires_chapter: 'c0', order_index: 2 });
    const c2 = chapterRow({ id: 3, code: 'c2', chapter: 3, min_realm: 9, requires_chapter: null, order_index: 3 });

    const locked = (await makeService({ db: chapterDb({ chapters: [c0, c1, c2], chapterProgress: [] }) }).svc.list(7)).data as { chapters: ChapterView[] };
    assert.deepEqual(locked.chapters.map((c) => [c.code, c.unlocked, c.unlockedReason]), [
      ['c0', true, 'ok'],
      ['c1', false, 'prev'],
      ['c2', false, 'realm'],
    ]);

    const open = (await makeService({
      db: chapterDb({
        chapters: [c0, c1, c2],
        chapterProgress: [{ id: 1, character_id: 11, chapter_id: 1, status: 'completed', rewards_granted: true, completed_at: null }],
      }),
    }).svc.list(7)).data as { chapters: ChapterView[]; currentChapter: number | null };
    assert.equal(open.chapters[1].unlocked, true);
    assert.equal(open.chapters[0].completed, true);
    assert.equal(open.currentChapter, 2); // c0 已完成，c1 已解锁未完成
  });

  test('章节任务计数：total/completed 按 chapter 汇总', async () => {
    const c0 = chapterRow({ id: 1, code: 'c0', chapter: 1 });
    const db = chapterDb({
      chapters: [c0],
      questDefs: [
        { code: 'q1', chapter: 1 },
        { code: 'q2', chapter: 1 },
        { code: 'q9', chapter: 9 },
      ],
      questProgress: [{ id: 1, character_id: 11, quest_code: 'q1', status: 'completed', objectives: null, completed_at: null, rewards_granted: true }],
    });
    const data = (await makeService({ db }).svc.list(7)).data as { chapters: ChapterView[] };
    assert.deepEqual(data.chapters[0].quests, { total: 2, completed: 1 });
  });
});

// ===== detail =====

describe('ChapterService.detail 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: chapterDb(), character: null });
    assert.equal(failingCode(await svc.detail(7, 'c1')), 'CHARACTER_NOT_FOUND');
  });

  test('key 不存在（空串 / 非数字 / 小数 / 越界数字）-> CHAPTER_NOT_FOUND', async () => {
    const ch = chapterRow({ code: 'c1', chapter: 1 });
    for (const key of ['', 'nope', '1.5', '99']) {
      const { svc } = makeService({ db: chapterDb({ chapters: [ch] }) });
      assert.equal(failingCode(await svc.detail(7, key)), 'CHAPTER_NOT_FOUND', 'key=' + key);
    }
  });

  test('按 code 或数字 chapter 命中，返回任务状态 / 奖励 / 对话；不再下发 zone（§22 Q1 解绑）', async () => {
    const ch = chapterRow({ code: 'c1', chapter: 1, rewards: '{"lingyun":5}', dialogues: '{"intro":"I"}' });
    const db = chapterDb({
      chapters: [ch],
      detailQuests: [
        { code: 'q1', name: '任务一', order_index: 1 },
        { code: 'q2', name: '任务二', order_index: 2 },
      ],
      zone: [{ code: 'z1', name: '秘境一' }],
    });
    const questList: QuestListResult = { success: true, message: '', data: { quests: [{ code: 'q1', status: 'active' }] } };

    for (const key of ['c1', '1']) {
      const data = (await makeService({ db, questList }).svc.detail(7, key)).data as {
        chapter: Record<string, unknown> & { rewards: unknown; dialogues: unknown; quests: Array<{ code: string; status: string }> };
      };
      // §22 Q1：章节与秘境彻底解绑 —— `zone` 字段整体消失（不是变成 null，是**不再存在**）
      assert.ok(!('zone' in data.chapter), '章节详情不应再下发 zone（§22 Q1 已解绑）');
      assert.deepEqual(data.chapter.rewards, { lingyun: 5 });
      assert.deepEqual(data.chapter.dialogues, { intro: 'I' });
      assert.deepEqual(data.chapter.quests, [
        { code: 'q1', name: '任务一', status: 'active' },
        { code: 'q2', name: '任务二', status: 'locked' },
      ]);
    }
  });

  test('章节目录同样不再下发 zoneCode（§22 Q1）', async () => {
    const db = chapterDb({ chapters: [chapterRow({ code: 'c1', chapter: 1 })] });
    const data = (await makeService({ db }).svc.list(7)).data as {
      chapters: Array<Record<string, unknown>>;
    };
    assert.ok(data.chapters.length > 0);
    for (const chapter of data.chapters) {
      assert.ok(!('zoneCode' in chapter), '章节目录不应再下发 zoneCode（§22 Q1 已解绑）');
    }
  });

  test('zone_code 为 null（§22 后列恒为空）也不崩：不再查 game_zones、不产生 zone 字段', async () => {
    const ch = chapterRow({ code: 'c1', chapter: 1, zone_code: null, rewards: 'bad', dialogues: 'bad' });
    const db = chapterDb({ chapters: [ch], zone: [] });
    const data = (await makeService({ db }).svc.detail(7, 'c1')).data as {
      chapter: Record<string, unknown> & { rewards: unknown; dialogues: unknown };
    };
    assert.ok(!('zone' in data.chapter));
    assert.deepEqual(data.chapter.rewards, {});
    assert.equal(data.chapter.dialogues, null);
  });
});

// ===== sync =====

describe('ChapterService.sync 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: chapterDb(), character: null });
    assert.equal(failingCode(await svc.sync(7)), 'CHARACTER_NOT_FOUND');
  });

  test('收尾任务完成且已解锁 -> 新建进度并调用 grantRewardBundle + 置 rewards_granted', async () => {
    const ch = chapterRow({ id: 1, code: 'c1', quest_end_code: 'q2', rewards: '{"lingyun":10,"essences":{"e1":2}}' });
    const db = chapterDb({
      chapters: [ch],
      chapterProgress: [],
      questProgress: [{ id: 1, character_id: 11, quest_code: 'q2', status: 'completed', objectives: null, completed_at: null, rewards_granted: true }],
      insert: [{ id: 1 }],
      pending: [{ id: 1, character_id: 11, chapter_id: 1, status: 'completed', rewards_granted: false, completed_at: null, def_rewards: '{"lingyun":10,"essences":{"e1":2}}', def_name: '第一章', def_code: 'c1' }],
    });
    const { svc, questStub } = makeService({ db });
    const res = await svc.sync(7);
    const data = res.data as {
      completedCount: number;
      completed: unknown[];
      granted: unknown[];
      totals: { lingyun: number; essences: Record<string, number> };
    };
    assert.equal(data.completedCount, 1);
    assert.equal(data.completed.length, 1);
    assert.equal(data.granted.length, 1);
    assert.equal(data.totals.lingyun, 10);
    assert.deepEqual(data.totals.essences, { e1: 2 });
    assert.equal(questStub.grantRewardBundle.callCount, 1);
    assert.deepEqual(questStub.grantRewardBundle.last, [11, { lingyun: 10, essences: { e1: 2 } }]);
    assert.deepEqual(db.lastCall(/UPDATE game_chapter_progress SET rewards_granted/)?.params, [[1]]);
  });

  test('幂等：章节已 completed -> 不新建、不重复发奖', async () => {
    const ch = chapterRow({ id: 1, code: 'c1', quest_end_code: 'q2' });
    const db = chapterDb({
      chapters: [ch],
      chapterProgress: [{ id: 1, character_id: 11, chapter_id: 1, status: 'completed', rewards_granted: true, completed_at: null }],
      questProgress: [{ id: 1, character_id: 11, quest_code: 'q2', status: 'completed', objectives: null, completed_at: null, rewards_granted: true }],
      pending: [],
    });
    const { svc, questStub } = makeService({ db });
    const data = (await svc.sync(7)).data as { completedCount: number; granted: unknown[] };
    assert.equal(data.completedCount, 0);
    assert.equal(data.granted.length, 0);
    assert.equal(questStub.grantRewardBundle.callCount, 0);
    assert.equal(db.callsMatching(/INSERT INTO game_chapter_progress/).length, 0);
    assert.equal(db.callsMatching(/UPDATE game_chapter_progress SET rewards_granted/).length, 0);
  });

  test('INSERT 冲突（0 行）-> 不计新完成，但未发奖会补发', async () => {
    const ch = chapterRow({ id: 1, code: 'c1', quest_end_code: 'q2', rewards: '{"lingyun":10}' });
    const db = chapterDb({
      chapters: [ch],
      chapterProgress: [],
      questProgress: [{ id: 1, character_id: 11, quest_code: 'q2', status: 'completed', objectives: null, completed_at: null, rewards_granted: true }],
      insert: [],
      pending: [{ id: 1, character_id: 11, chapter_id: 1, status: 'completed', rewards_granted: false, completed_at: null, def_rewards: '{"lingyun":10}', def_name: '第一章', def_code: 'c1' }],
    });
    const { svc, questStub } = makeService({ db });
    const data = (await svc.sync(7)).data as { completedCount: number; granted: unknown[] };
    assert.equal(data.completedCount, 0);
    assert.equal(data.granted.length, 1);
    assert.equal(questStub.grantRewardBundle.callCount, 1);
    assert.equal(db.callsMatching(/UPDATE game_chapter_progress SET rewards_granted/).length, 1);
  });

  test('未解锁（realm 不足）或收尾任务未完成 -> 不建进度', async () => {
    const locked = chapterRow({ id: 1, code: 'c1', min_realm: 9, quest_end_code: 'q2' });
    const db1 = chapterDb({
      chapters: [locked],
      questProgress: [{ id: 1, character_id: 11, quest_code: 'q2', status: 'completed', objectives: null, completed_at: null, rewards_granted: true }],
    });
    const res1 = await makeService({ db: db1 }).svc.sync(7);
    assert.equal((res1.data as { completedCount: number }).completedCount, 0);
    assert.equal(db1.callsMatching(/INSERT INTO game_chapter_progress/).length, 0);

    const open = chapterRow({ id: 1, code: 'c1', min_realm: 1, quest_end_code: 'q2' });
    const db2 = chapterDb({ chapters: [open], questProgress: [] });
    const res2 = await makeService({ db: db2 }).svc.sync(7);
    assert.equal((res2.data as { completedCount: number }).completedCount, 0);
    assert.equal(db2.callsMatching(/INSERT INTO game_chapter_progress/).length, 0);
  });
});
