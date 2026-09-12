import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StoryAction } from '../../src/modules/logic/story/story.action.js';
import { STORY_CMD } from '../../src/ionet/cmd.js';
import { flowContext } from '../helpers/flow.js';
import { stub } from '../helpers/stub.js';

// 说明：StoryAction 只做鉴权 + 参数解析后转交门面，不直接访问 DB；
// README 的「SQL 无行/单行/多行、DB 抛错/超时」在 Action 层不可达，由 story.logic.service 测试覆盖。

function makeAction(): { action: StoryAction; facade: Record<string, ReturnType<typeof stub>> } {
  const facade = {
    chapterStory: stub(() => 'CHAPTER_STORY'),
    questStory: stub(() => 'QUEST_STORY'),
    markSeen: stub(() => 'MARK_SEEN'),
  };
  return { action: new StoryAction(facade as never), facade };
}

const ctx = (subCmd: number) => flowContext({ userId: 1, cmd: STORY_CMD.cmd, subCmd });
const codeOf = (res: unknown): string => (res as { data: { code: string } }).data.code;

type Invoke = (action: StoryAction, data: unknown) => Promise<unknown>;
const UNAUTH_CASES: Array<[string, Invoke]> = [
  ['chapter', (a, d) => a.chapter(flowContext({ cmd: STORY_CMD.cmd, subCmd: STORY_CMD.chapter }), d)],
  ['quest', (a, d) => a.quest(flowContext({ cmd: STORY_CMD.cmd, subCmd: STORY_CMD.quest }), d)],
  ['seen', (a, d) => a.seen(flowContext({ cmd: STORY_CMD.cmd, subCmd: STORY_CMD.seen }), d)],
];

describe('StoryAction 鉴权边界', () => {
  for (const [name, invoke] of UNAUTH_CASES) {
    test(name + ': 未鉴权 -> UNAUTHORIZED 且不触达门面', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await invoke(action, {})), 'UNAUTHORIZED');
      for (const s of Object.values(facade)) assert.equal(s.callCount, 0);
    });
  }

  test('userId=0（0n）视为未鉴权', async () => {
    const { action, facade } = makeAction();
    const res = await action.seen(flowContext({ userId: 0, cmd: STORY_CMD.cmd, subCmd: STORY_CMD.seen }), { nodeKey: 'n1' });
    assert.equal(codeOf(res), 'UNAUTHORIZED');
    assert.equal(facade.markSeen.callCount, 0);
  });
});

describe('StoryAction.chapter 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const chapter of bad) {
    test('chapter=' + JSON.stringify(chapter) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.chapter(ctx(STORY_CMD.chapter), { chapter })), 'INVALID_PARAM');
      assert.equal(facade.chapterStory.callCount, 0);
    });
  }

  test('chapter 去空白透传', async () => {
    const { action, facade } = makeAction();
    const res = await action.chapter(ctx(STORY_CMD.chapter), { chapter: ' ch-1 ' });
    assert.deepEqual(facade.chapterStory.last, [1, 'ch-1']);
    assert.equal(res, 'CHAPTER_STORY');
  });
});

describe('StoryAction.quest 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const code of bad) {
    test('code=' + JSON.stringify(code) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.quest(ctx(STORY_CMD.quest), { code })), 'INVALID_PARAM');
      assert.equal(facade.questStory.callCount, 0);
    });
  }

  test('code 去空白透传', async () => {
    const { action, facade } = makeAction();
    const res = await action.quest(ctx(STORY_CMD.quest), { code: ' q1 ' });
    assert.deepEqual(facade.questStory.last, [1, 'q1']);
    assert.equal(res, 'QUEST_STORY');
  });
});

describe('StoryAction.seen 参数边界', () => {
  const bad: unknown[] = [undefined, null, '', '   ', 123, {}, [], true];
  for (const nodeKey of bad) {
    test('nodeKey=' + JSON.stringify(nodeKey) + ' -> INVALID_PARAM', async () => {
      const { action, facade } = makeAction();
      assert.equal(codeOf(await action.seen(ctx(STORY_CMD.seen), { nodeKey })), 'INVALID_PARAM');
      assert.equal(facade.markSeen.callCount, 0);
    });
  }

  test('nodeKey 校验用 trim 但透传原值（不去空白）', async () => {
    const { action, facade } = makeAction();
    const res = await action.seen(ctx(STORY_CMD.seen), { nodeKey: '  n1  ' });
    assert.deepEqual(facade.markSeen.last, [1, '  n1  ']);
    assert.equal(res, 'MARK_SEEN');
  });
});
