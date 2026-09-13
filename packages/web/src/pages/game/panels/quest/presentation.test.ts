/**
 * `quest/presentation` 纯函数单测（不渲染组件）。
 *
 * 覆盖：状态中文映射（未知状态码不回显协议原文）、目标进度文案与百分比的
 * 分母边界（0 / 负数 / undefined / NaN / Infinity 均不得产出 NaN / Infinity）、
 * `orderIndex` 相同或缺失时的稳定排序、章节锁定原因解析（未知前置 code 回退中文占位）。
 */
import { describe, expect, it } from 'vitest';
import type { ChapterView, ObjectiveProgress, QuestStatus, QuestView } from '@idle-path/ionet-transport';
import {
  chapterLock,
  chapterProgressText,
  claimableCount,
  objectivePercent,
  objectiveProgressText,
  questStatusColor,
  questStatusLabel,
  sortQuests,
} from './presentation.js';

function makeObjective(overrides: Partial<ObjectiveProgress> = {}): ObjectiveProgress {
  return { type: 'kill_total', current: 3, done: false, desc: '击败妖兽', value: 10, ...overrides };
}

function makeQuest(overrides: Partial<QuestView> = {}): QuestView {
  return {
    code: 'quest_a',
    chapter: 1,
    name: '初入江湖',
    orderIndex: 1,
    status: 'active',
    claimable: false,
    objectives: [],
    ...overrides,
  };
}

function makeChapter(overrides: Partial<ChapterView> = {}): ChapterView {
  return {
    code: 'chapter_1',
    chapter: 1,
    name: '第一章 · 入门',
    theme: null,
    minRealm: 1,
    zoneCode: 'zone_a',
    requiresChapter: null,
    orderIndex: 1,
    unlocked: true,
    unlockedReason: 'ok',
    completed: false,
    quests: { total: 2, completed: 1 },
    ...overrides,
  };
}

describe('questStatusLabel / questStatusColor', () => {
  it.each([
    ['locked', '未解锁', 'default'],
    ['active', '进行中', 'processing'],
    ['completed', '已完成', 'success'],
  ] as const)('%s → 中文「%s」/ 标签色 %s', (status, label, color) => {
    expect(questStatusLabel(status)).toBe(label);
    expect(questStatusColor(status)).toBe(color);
  });

  it('未知状态码退化为中文占位 + default 色，且不回显协议原文', () => {
    const unknownStatuses = ['archived', '', 'LOCKED'] as unknown as QuestStatus[];
    for (const status of unknownStatuses) {
      expect(questStatusLabel(status)).toBe('未知状态');
      expect(questStatusColor(status)).toBe('default');
      const text = String(questStatusLabel(status));
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('archived');
      expect(text).not.toContain('LOCKED');
    }
  });
});

describe('objectiveProgressText', () => {
  it('目标值存在时给出「当前 / 目标」', () => {
    expect(objectiveProgressText(makeObjective({ current: 3, value: 10 }))).toBe('3 / 10');
  });

  it('目标值缺失或非有限时只显示当前值', () => {
    expect(objectiveProgressText(makeObjective({ current: 3, value: undefined }))).toBe('3');
    expect(objectiveProgressText(makeObjective({ current: 3, value: Number.NaN }))).toBe('3');
    expect(objectiveProgressText(makeObjective({ current: 3, value: Number.POSITIVE_INFINITY }))).toBe('3');
  });

  it('当前值非有限时降级为占位符而不是 NaN', () => {
    expect(objectiveProgressText(makeObjective({ current: Number.NaN, value: 10 }))).toBe('— / 10');
  });

  it('大数值走万/亿压缩，不出现裸浮点', () => {
    expect(objectiveProgressText(makeObjective({ current: 12345, value: 100000 }))).toBe('1.2 万 / 10 万');
  });
});

describe('objectivePercent', () => {
  it('正常比例向下取整并夹在 0~100', () => {
    expect(objectivePercent(makeObjective({ current: 3, value: 10 }))).toBe(30);
    expect(objectivePercent(makeObjective({ current: 30, value: 10 }))).toBe(100);
    expect(objectivePercent(makeObjective({ current: -5, value: 10 }))).toBe(0);
  });

  it('分母为 0 / 负数 / 缺失 / NaN / Infinity 时不产出 NaN / Infinity', () => {
    for (const value of [0, -1, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const percent = objectivePercent(makeObjective({ current: 5, value }));
      expect(Number.isFinite(percent)).toBe(true);
      expect(percent).toBe(0);
    }
  });

  it('分母非法但已标记完成时给 100', () => {
    for (const value of [0, -1, undefined, Number.NaN]) {
      expect(objectivePercent(makeObjective({ current: 5, value, done: true }))).toBe(100);
    }
  });

  it('当前值非有限时也退化为 0', () => {
    expect(objectivePercent(makeObjective({ current: Number.NaN, value: 10 }))).toBe(0);
    expect(objectivePercent(makeObjective({ current: Number.POSITIVE_INFINITY, value: 10 }))).toBe(0);
  });
});

describe('sortQuests', () => {
  it('空数组返回空数组', () => {
    expect(sortQuests([])).toEqual([]);
  });

  it('先按章节、再按 orderIndex 升序', () => {
    const quests = [
      makeQuest({ code: 'c', chapter: 2, orderIndex: 1 }),
      makeQuest({ code: 'a', chapter: 1, orderIndex: 2 }),
      makeQuest({ code: 'b', chapter: 1, orderIndex: 1 }),
    ];
    expect(sortQuests(quests).map((quest) => quest.code)).toEqual(['b', 'a', 'c']);
  });

  it('orderIndex 相同或缺失时保持稳定（原相对顺序不变）', () => {
    const same = [makeQuest({ code: 'first', orderIndex: 1 }), makeQuest({ code: 'second', orderIndex: 1 })];
    expect(sortQuests(same).map((quest) => quest.code)).toEqual(['first', 'second']);

    const missing = [
      makeQuest({ code: 'x', orderIndex: undefined as unknown as number }),
      makeQuest({ code: 'y', orderIndex: undefined as unknown as number }),
    ];
    expect(sortQuests(missing).map((quest) => quest.code)).toEqual(['x', 'y']);
  });

  it('不修改入参数组（返回新数组）', () => {
    const quests = [makeQuest({ code: 'b', orderIndex: 2 }), makeQuest({ code: 'a', orderIndex: 1 })];
    const sorted = sortQuests(quests);

    expect(sorted).not.toBe(quests);
    expect(quests.map((quest) => quest.code)).toEqual(['b', 'a']);
  });
});

describe('claimableCount / chapterProgressText', () => {
  it('空数组边界', () => {
    expect(claimableCount([])).toBe(0);
    expect(chapterProgressText([])).toBe('0 / 0');
  });

  it('只统计 claimable 与 completed', () => {
    expect(claimableCount([makeQuest({ claimable: true }), makeQuest(), makeQuest({ claimable: true })])).toBe(2);

    const chapters = [makeChapter({ completed: true }), makeChapter({ code: 'chapter_2', completed: false })];
    expect(chapterProgressText(chapters)).toBe('1 / 2');
  });
});

describe('chapterLock', () => {
  it('已解锁返回 null', () => {
    expect(chapterLock(makeChapter(), [makeChapter()])).toBeNull();
  });

  it('境界不足返回 realm 类别（需要 / 当前由 LockedHint 承担）', () => {
    const chapter = makeChapter({ unlocked: false, unlockedReason: 'realm', minRealm: 5 });
    expect(chapterLock(chapter, [chapter])).toEqual({ reason: 'realm' });
  });

  it('前置章节存在时给出中文名', () => {
    const prev = makeChapter({ code: 'chapter_1', name: '第一章 · 入门' });
    const chapter = makeChapter({
      code: 'chapter_2',
      unlocked: false,
      unlockedReason: 'prev',
      requiresChapter: 'chapter_1',
    });
    expect(chapterLock(chapter, [prev, chapter])).toEqual({ reason: 'prev', hint: '需先完成「第一章 · 入门」' });
  });

  it('前置 code 缺失 / 未知 / 章节列表为空时回退中文占位，不回显 code', () => {
    const chapters = [
      makeChapter({ unlocked: false, unlockedReason: 'prev', requiresChapter: null }),
      makeChapter({ unlocked: false, unlockedReason: 'prev', requiresChapter: 'chapter_unknown' }),
    ];
    for (const chapter of chapters) {
      const lock = chapterLock(chapter, [makeChapter()]);
      expect(lock).toEqual({ reason: 'prev', hint: '需先完成前置章节' });
      expect(JSON.stringify(lock)).not.toContain('chapter_unknown');
    }

    const orphan = makeChapter({ unlocked: false, unlockedReason: 'prev', requiresChapter: 'chapter_unknown' });
    expect(chapterLock(orphan, [])).toEqual({ reason: 'prev', hint: '需先完成前置章节' });
  });
});
