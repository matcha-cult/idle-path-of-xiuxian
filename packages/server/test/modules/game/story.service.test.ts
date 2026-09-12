import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StoryService } from '../../../src/modules/game/story/story.service.js';
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
    theme: null,
    min_realm: 1,
    zone_code: 'z1',
    quest_start_code: 'q1',
    quest_end_code: 'q2',
    requires_chapter: null,
    rewards: '{}',
    dialogues: null as string | null,
    order_index: 1,
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
    dialogues: '{}',
    next_quest: null,
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
  const questStub = { list: stub(async () => opts.questList ?? { success: true, message: '', data: { quests: [] } }) };
  const svc = new StoryService(opts.db as never, charStub as never, questStub as never);
  return { svc, charStub, questStub };
}

interface StoryDbOptions {
  chapters?: Array<Record<string, unknown>>;
  chapterQuests?: Array<Record<string, unknown>>;
  quest?: Array<Record<string, unknown>>;
  seen?: Array<{ node_key: string }>;
}

function storyDb(opts: StoryDbOptions = {}): FakeDatabase {
  return new FakeDatabase()
    .on(/FROM game_chapters ORDER BY order_index, id/, { rows: opts.chapters ?? [] })
    .on(/FROM game_quest_defs WHERE chapter = \$1/, { rows: opts.chapterQuests ?? [] })
    .on(/FROM game_quest_defs WHERE code = \$1/, { rows: opts.quest ?? [] })
    .on(/SELECT node_key FROM game_story_seen WHERE character_id = \$1/, { rows: opts.seen ?? [] });
}

function failingCode(res: { success: boolean; data?: unknown }): string | undefined {
  return (res.data as { code?: string } | undefined)?.code;
}

interface NodeView {
  nodeKey: string;
  type: string;
  text: string;
  seen: boolean;
  questCode?: string;
  questStatus?: string;
}

// ===== chapterStory =====

describe('StoryService.chapterStory 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: storyDb(), character: null });
    assert.equal(failingCode(await svc.chapterStory(7, 'c1')), 'CHARACTER_NOT_FOUND');
  });

  test('章节不存在（含空串 / 非数字 / 小数）-> CHAPTER_NOT_FOUND', async () => {
    for (const key of ['nope', '', '1.5']) {
      const { svc } = makeService({ db: storyDb({ chapters: [] }) });
      assert.equal(failingCode(await svc.chapterStory(7, key)), 'CHAPTER_NOT_FOUND', 'key=' + key);
    }
  });

  test('章节/任务节点顺序 + 已读标记 + 任务状态', async () => {
    const ch = chapterRow({ code: 'c1', dialogues: '{"intro":"章首","outro":"章尾"}' });
    const def = defRow({ code: 'q1', dialogues: '{"start":"开始","done":"完成"}' });
    const db = storyDb({
      chapters: [ch],
      chapterQuests: [def],
      seen: [{ node_key: 'chapter:c1:intro' }, { node_key: 'quest:q1:done' }],
    });
    const questList: QuestListResult = { success: true, message: '', data: { quests: [{ code: 'q1', status: 'active' }] } };
    const data = (await makeService({ db, questList }).svc.chapterStory(7, 'c1')).data as { nodes: NodeView[] };
    assert.deepEqual(data.nodes.map((n) => [n.nodeKey, n.type, n.text, n.seen]), [
      ['chapter:c1:intro', 'chapter_intro', '章首', true],
      ['quest:q1:start', 'quest_start', '开始', false],
      ['quest:q1:done', 'quest_done', '完成', true],
      ['chapter:c1:outro', 'chapter_outro', '章尾', false],
    ]);
    assert.equal(data.nodes[1].questStatus, 'active');
    assert.equal(data.nodes[1].questCode, 'q1');
  });

  test('数字 chapter 命中；未在 questList 中的任务状态默认 locked', async () => {
    const ch = chapterRow({ code: 'c1', dialogues: '{}' });
    const def = defRow({ code: 'q1', dialogues: '{"start":"S"}' });
    const db = storyDb({ chapters: [ch], chapterQuests: [def] });
    const data = (await makeService({ db }).svc.chapterStory(7, '1')).data as { nodes: NodeView[] };
    assert.equal(data.nodes.length, 1);
    assert.equal(data.nodes[0].questStatus, 'locked');
  });

  test('非法 JSON dialogues -> {}，无任何节点', async () => {
    const ch = chapterRow({ code: 'c1', dialogues: 'bad' });
    const def = defRow({ code: 'q1', dialogues: 'bad' });
    const db = storyDb({ chapters: [ch], chapterQuests: [def] });
    const data = (await makeService({ db }).svc.chapterStory(7, 'c1')).data as { nodes: NodeView[] };
    assert.deepEqual(data.nodes, []);
  });

  test('无章节任务 / seen 为空 -> 仅章节节点且 seen 全 false', async () => {
    const ch = chapterRow({ code: 'c1', dialogues: '{"intro":"I"}' });
    const db = storyDb({ chapters: [ch], chapterQuests: [], seen: [] });
    const data = (await makeService({ db }).svc.chapterStory(7, 'c1')).data as { nodes: NodeView[] };
    assert.equal(data.nodes.length, 1);
    assert.equal(data.nodes[0].seen, false);
  });
});

// ===== questStory =====

describe('StoryService.questStory 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { svc } = makeService({ db: storyDb(), character: null });
    assert.equal(failingCode(await svc.questStory(7, 'q1')), 'CHARACTER_NOT_FOUND');
  });

  test('任务不存在（含空串）-> QUEST_NOT_FOUND', async () => {
    for (const code of ['nope', '']) {
      const { svc } = makeService({ db: storyDb({ quest: [] }) });
      assert.equal(failingCode(await svc.questStory(7, code)), 'QUEST_NOT_FOUND');
    }
  });

  test('节点只包含存在的 start/done；状态与已读正确', async () => {
    const def = defRow({ code: 'q1', dialogues: '{"start":"S","done":"D"}' });
    const db = storyDb({ quest: [def], seen: [{ node_key: 'quest:q1:start' }] });
    const questList: QuestListResult = { success: true, message: '', data: { quests: [{ code: 'q1', status: 'completed' }] } };
    const data = (await makeService({ db, questList }).svc.questStory(7, 'q1')).data as {
      quest: { code: string; status: string };
      nodes: NodeView[];
    };
    assert.equal(data.quest.status, 'completed');
    assert.deepEqual(data.nodes.map((n) => [n.nodeKey, n.seen]), [
      ['quest:q1:start', true],
      ['quest:q1:done', false],
    ]);
  });

  test('只有 done 对话 / 空对话 -> 对应节点数', async () => {
    const onlyDone = defRow({ code: 'q1', dialogues: '{"done":"D"}' });
    const d1 = (await makeService({ db: storyDb({ quest: [onlyDone] }) }).svc.questStory(7, 'q1')).data as { nodes: NodeView[] };
    assert.deepEqual(d1.nodes.map((n) => n.type), ['quest_done']);

    const empty = defRow({ code: 'q1', dialogues: '{}' });
    const d2 = (await makeService({ db: storyDb({ quest: [empty] }) }).svc.questStory(7, 'q1')).data as { nodes: NodeView[] };
    assert.deepEqual(d2.nodes, []);
  });
});

// ===== markSeen =====

describe('StoryService.markSeen 边界', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db, character: null });
    assert.equal(failingCode(await svc.markSeen(7, 'chapter:c1:intro')), 'CHARACTER_NOT_FOUND');
    assert.equal(db.callCount, 0);
  });

  test('nodeKey 空串 / 纯空白 / 超长 121 -> INVALID_PARAM 且不落库', async () => {
    for (const key of ['', '   ', 'a'.repeat(121)]) {
      const db = new FakeDatabase();
      const { svc } = makeService({ db });
      assert.equal(failingCode(await svc.markSeen(7, key)), 'INVALID_PARAM');
      assert.equal(db.callCount, 0);
    }
  });

  test('类型不符（数字）-> INVALID_PARAM', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db });
    assert.equal(failingCode(await svc.markSeen(7, 123 as never)), 'INVALID_PARAM');
    assert.equal(db.callCount, 0);
  });

  test('120 字符（上界）-> 成功；前后空白会 trim 后判定长度', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db });
    const res = await svc.markSeen(7, ' ' + 'a'.repeat(120) + ' ');
    assert.equal(res.success, true);
    assert.deepEqual(db.lastCall(/INSERT INTO game_story_seen/)?.params, [11, 'a'.repeat(120)]);
  });

  test('trim 生效：前后空白被去除后落库', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db });
    const res = await svc.markSeen(7, '  chapter:c1:intro  ');
    assert.equal(res.success, true);
    assert.deepEqual((res.data as { nodeKey: string }).nodeKey, 'chapter:c1:intro');
    assert.deepEqual(db.lastCall(/INSERT INTO game_story_seen/)?.params, [11, 'chapter:c1:intro']);
  });

  test('幂等：重复调用两条 ON CONFLICT DO NOTHING 语句，参数一致', async () => {
    const db = new FakeDatabase();
    const { svc } = makeService({ db });
    await svc.markSeen(7, 'chapter:c1:intro');
    await svc.markSeen(7, 'chapter:c1:intro');
    const inserts = db.callsMatching(/INSERT INTO game_story_seen/);
    assert.equal(inserts.length, 2);
    assert.ok(inserts.every((c) => /ON CONFLICT \(character_id, node_key\) DO NOTHING/.test(c.sql)));
    assert.deepEqual(inserts[0].params, inserts[1].params);
  });
});
