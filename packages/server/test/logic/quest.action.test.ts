import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { QuestAction } from '../../src/modules/logic/quest/quest.action.js';
import { QUEST_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：QuestAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 quest.logic.service 测试覆盖。

function makeAction(): { action: QuestAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    list: stub(() => 'LIST'),
    detail: stub(() => 'DETAIL'),
    sync: stub(() => 'SYNC'),
    chapterList: stub(() => 'CHAPTER_LIST'),
    chapterDetail: stub(() => 'CHAPTER_DETAIL'),
    chapterSync: stub(() => 'CHAPTER_SYNC'),
  };
  return { action: new QuestAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: QUEST_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: QuestAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['list', (a, d) => a.list(flowContext({ cmd: QUEST_CMD.cmd, subCmd: QUEST_CMD.list }), d)],
  ['detail', (a, d) => a.detail(flowContext({ cmd: QUEST_CMD.cmd, subCmd: QUEST_CMD.detail }), d)],
  ['sync', (a, d) => a.sync(flowContext({ cmd: QUEST_CMD.cmd, subCmd: QUEST_CMD.sync }), d)],
  ['chapterList', (a, d) => a.chapterList(flowContext({ cmd: QUEST_CMD.cmd, subCmd: QUEST_CMD.chapterList }), d)],
  ['chapterDetail', (a, d) => a.chapterDetail(flowContext({ cmd: QUEST_CMD.cmd, subCmd: QUEST_CMD.chapterDetail }), d)],
  ['chapterSync', (a, d) => a.chapterSync(flowContext({ cmd: QUEST_CMD.cmd, subCmd: QUEST_CMD.chapterSync }), d)],
];

describe('QuestAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.detail(flowContext({ userId: 0, cmd: QUEST_CMD.cmd, subCmd: QUEST_CMD.detail }), { code: 'q1' });
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.detail.callCount, 0);
  });
});

describe('QuestAction 无参 subCmd', () => {
  const noArg: Array<[string, number]> = [
    ['list', QUEST_CMD.list],
    ['sync', QUEST_CMD.sync],
    ['chapterList', QUEST_CMD.chapterList],
    ['chapterSync', QUEST_CMD.chapterSync],
  ];
  for (const [name, subCmd] of noArg) {
    test(name + ' -> 直接转交门面（忽略 data）', async () => {
      const { action, facade } = makeAction();
      await (action as unknown as Record<string, (c: unknown, d: unknown) => Promise<unknown>>)[name](ctx(subCmd), { garbage: 1 });
      assert.deepEqual(facade[name].last, [1]);
    });
  }
});

describe('QuestAction.detail 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const code of bad) {
    test('code=' + JSON.stringify(code) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.detail(ctx(QUEST_CMD.detail), { code })), 'INVALID_PARAM');
      assert.equal(facade.detail.callCount, 0);
    });
  }

  test('code 去空白透传', async () => {
    const { action, facade } = makeAction();
    const res = await action.detail(ctx(QUEST_CMD.detail), { code: ' q1 ' });
    assert.deepEqual(facade.detail.last, [1, 'q1']);
    assert.equal(res, 'DETAIL');
  });
});

describe('QuestAction.chapterDetail 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const chapter of bad) {
    test('chapter=' + JSON.stringify(chapter) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.chapterDetail(ctx(QUEST_CMD.chapterDetail), { chapter })), 'INVALID_PARAM');
      assert.equal(facade.chapterDetail.callCount, 0);
    });
  }

  test('chapter 既可为序号字符串也可为 code，去空白透传', async () => {
    const { action, facade } = makeAction();
    const res = await action.chapterDetail(ctx(QUEST_CMD.chapterDetail), { chapter: ' 3 ' });
    assert.deepEqual(facade.chapterDetail.last, [1, '3']);
    assert.equal(res, 'CHAPTER_DETAIL');
    await action.chapterDetail(ctx(QUEST_CMD.chapterDetail), { chapter: 'ch-1' });
    assert.deepEqual(facade.chapterDetail.last, [1, 'ch-1']);
  });
});
