/**
 * `story/presentation` 纯函数单测（不渲染组件）。
 *
 * 覆盖：章节目录标题、未读统计（`seen` 缺失按未读）、任务剧本标题的 code→名称 join
 * （未知 / 空 / 缺失 `questCode` 一律回退中文占位，不回显 code），以及
 * `toNodeViews` 的字段保留、已读/未读的 `onSeen` 语义与「不修改入参 / 不自动回调」。
 */
import { describe, expect, it, vi } from 'vitest';
import type { QuestView, StoryNode } from '@idle-path/ionet-transport';
import { chapterLabel, questScriptTitle, toNodeViews, unreadCount } from './presentation.js';

function makeNode(overrides: Partial<StoryNode> = {}): StoryNode {
  return { nodeKey: 'chapter:c3:intro', type: 'chapter_intro', text: '天地初开', seen: false, ...overrides };
}

function makeQuest(overrides: Partial<QuestView> = {}): QuestView {
  return {
    code: 'q1',
    chapter: 3,
    name: '初入江湖',
    orderIndex: 1,
    status: 'active',
    claimable: false,
    objectives: [],
    ...overrides,
  };
}

describe('chapterLabel', () => {
  it('正常章节给出「第 N 章 · 名称」', () => {
    expect(chapterLabel({ chapter: 3, name: '第三章' })).toBe('第 3 章 · 第三章');
  });

  it('边界：章节号为 0、名称为空串时照常拼接不抛错', () => {
    expect(chapterLabel({ chapter: 0, name: '' })).toBe('第 0 章 · ');
  });
});

describe('unreadCount', () => {
  it('空数组为 0', () => {
    expect(unreadCount([])).toBe(0);
  });

  it('只把 seen=true 算作已读', () => {
    const nodes = [
      makeNode({ seen: true }),
      makeNode({ nodeKey: 'a', seen: false }),
      makeNode({ nodeKey: 'b', seen: undefined as unknown as boolean }),
    ];
    expect(unreadCount(nodes)).toBe(2);
  });

  it('全部已读为 0', () => {
    expect(unreadCount([makeNode({ seen: true }), makeNode({ nodeKey: 'a', seen: true })])).toBe(0);
  });
});

describe('questScriptTitle', () => {
  it('空节点或节点缺少 questCode 时给通用标题', () => {
    expect(questScriptTitle([], [makeQuest()])).toBe('任务剧本');
    expect(questScriptTitle([makeNode()], [makeQuest()])).toBe('任务剧本');
  });

  it('questCode 命中任务列表时 join 成任务名', () => {
    const nodes = [makeNode({ nodeKey: 'quest:q1:start', type: 'quest_start', questCode: 'q1' })];
    expect(questScriptTitle(nodes, [makeQuest()])).toBe('任务剧本 · 初入江湖');
  });

  it('未知 questCode / 任务列表为空 / questCode 为空串时回退占位，不回显 code', () => {
    const unknown = [makeNode({ questCode: 'quest_unknown' })];
    expect(questScriptTitle(unknown, [makeQuest()])).toBe('任务剧本');
    expect(questScriptTitle(unknown, [])).toBe('任务剧本');
    expect(questScriptTitle([makeNode({ questCode: '' })], [makeQuest()])).toBe('任务剧本');
    expect(questScriptTitle(unknown, [makeQuest()])).not.toContain('quest_unknown');
  });
});

describe('toNodeViews', () => {
  it('空数组返回空数组', () => {
    expect(toNodeViews([], vi.fn())).toEqual([]);
  });

  it('保留 nodeKey / type / text / seen（不改写内容、不翻转已读）', () => {
    const node = makeNode({ nodeKey: 'chapter:c3:outro', type: 'chapter_outro', text: '落幕', seen: false });
    const views = toNodeViews([node], vi.fn());

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      nodeKey: 'chapter:c3:outro',
      type: 'chapter_outro',
      text: '落幕',
      seen: false,
    });
    expect(node.seen).toBe(false);
  });

  it('未读节点带「标记已读」入口，回调收到自己的 nodeKey', () => {
    const onSeen = vi.fn();
    const views = toNodeViews([makeNode({ nodeKey: 'quest:q1:done', seen: false })], onSeen);

    expect(views[0]?.onSeen).toBeTypeOf('function');
    expect(onSeen).not.toHaveBeenCalled();

    views[0]?.onSeen?.();
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(onSeen).toHaveBeenCalledWith('quest:q1:done');
  });

  it('已读节点或 seen 缺失语义：已读不给入口，缺失按未读处理', () => {
    const onSeen = vi.fn();
    const views = toNodeViews(
      [
        makeNode({ nodeKey: 'read', seen: true }),
        makeNode({ nodeKey: 'missing', seen: undefined as unknown as boolean }),
      ],
      onSeen,
    );

    expect(views[0]?.onSeen).toBeUndefined();
    expect(views[1]?.onSeen).toBeTypeOf('function');
    expect(onSeen).not.toHaveBeenCalled();
  });
});
