/**
 * QuestPanel（新版·玩法驱动）测试。
 * 重点：目标进度是否可读、章节锁定原因是否说清、一键结算是否真发 cmd，
 * 以及协议字段（code / orderIndex / status 原文 / objectives.type）是否真的没上屏。
 * 常量一律从 transport 导入（不写字面量），交互用例必须先 `await harness.connect()`。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QUEST_CMD } from '@idle-path/ionet-transport';
import type { ChapterView, CurrencyView, QuestSyncData, QuestView } from '@idle-path/ionet-transport';
import { createPanelHarness, type PanelHarness } from '../../../../test/helpers/panel-harness.js';
import { QuestPanel } from './QuestPanel.js';

function makeQuest(overrides: Partial<QuestView> = {}): QuestView {
  return {
    code: 'quest_a',
    chapter: 1,
    name: '初入江湖',
    orderIndex: 1,
    status: 'active',
    claimable: false,
    objectives: [{ type: 'kill_total', key: 'wolf_1', value: 10, current: 3, done: false, desc: '击败 10 只妖兽' }],
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

function makeSync(overrides: Partial<QuestSyncData> = {}): QuestSyncData {
  return {
    completedCount: 3,
    completed: [],
    granted: [
      { code: 'quest_a', name: '初入江湖', rewards: { lingyun: 100 } },
      { code: 'quest_b', name: '再入江湖', rewards: { spiritStones: 20 } },
    ],
    totals: { lingyun: 100, spiritStones: 20, jadeSlips: 5, currencies: {}, essences: {} },
    ...overrides,
  };
}

const CURRENCY: CurrencyView = {
  id: 1,
  code: 'chaos',
  name: '混沌石',
  description: '',
  implemented: true,
  owned: 3,
};

function makeCurrency(overrides: Partial<CurrencyView> = {}): CurrencyView {
  return { ...CURRENCY, ...overrides };
}

/** 默认种子：一个进行中的任务 + 一个已解锁章节 + 有角色（境界用于锁定对比）。 */
function setup(seedFn?: (harness: PanelHarness) => void): PanelHarness {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.session.character = {
      id: 1,
      userId: 1,
      nickname: '验收道友',
      gender: 'male',
      title: '散修',
      spiritStones: 0,
      silver: 0,
      realm: 2,
      lingyun: 0,
      jadeSlips: 0,
    };
    harness.root.quest.quests = [makeQuest()];
    harness.root.quest.total = 1;
    harness.root.quest.completed = 0;
    harness.root.quest.chapters = [makeChapter()];
    harness.root.quest.currentChapter = 1;
    seedFn?.(harness);
  });
  return harness;
}

describe('QuestPanel · 现在该做什么', () => {
  it('任务卡展示名称 / 状态中文 / 目标描述与进度，且协议字段不上屏', () => {
    const harness = setup();
    harness.render(<QuestPanel />);

    expect(screen.getByText('初入江湖')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.getByText('击败 10 只妖兽')).toBeInTheDocument();
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(screen.getByText(/已完成 0 \/ 共 1/)).toBeInTheDocument();

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('quest_a');
    expect(text).not.toContain('active');
    expect(text).not.toContain('orderIndex');
    expect(text).not.toContain('kill_total');
    expect(text).not.toContain('wolf_1');
  });

  it('概览统计：已完成 / 可结算 / 当前章节 / 章节进度', () => {
    const harness = setup((h) => {
      h.root.quest.quests = [makeQuest(), makeQuest({ code: 'quest_b', name: '再入江湖', orderIndex: 2, claimable: true })];
      h.root.quest.total = 5;
      h.root.quest.completed = 2;
      h.root.quest.chapters = [makeChapter({ completed: true }), makeChapter({ code: 'chapter_2', chapter: 2, name: '第二章' })];
      h.root.quest.currentChapter = 2;
    });
    harness.render(<QuestPanel />);

    const stats = screen.getByTestId('quest-stats');
    expect(stats).toHaveTextContent('已完成');
    expect(stats).toHaveTextContent('可结算');
    expect(stats).toHaveTextContent('当前章节');
    expect(stats).toHaveTextContent('第 2 章');
    expect(stats).toHaveTextContent('章节进度');
    expect(stats).toHaveTextContent('1 / 2');
    expect(within(stats).getByText('1')).toBeInTheDocument();
  });

  it('边界：目标缺少目标值只显示当前值；无目标的任务给出说明文案', () => {
    const harness = setup((h) => {
      h.root.quest.quests = [
        makeQuest({ code: 'quest_a', objectives: [{ type: 'lingyun', current: 2, done: false, desc: '积累灵韵' }] }),
        makeQuest({ code: 'quest_b', name: '再入江湖', orderIndex: 2, objectives: [] }),
      ];
    });
    harness.render(<QuestPanel />);

    expect(within(screen.getByTestId('quest-objectives-quest_a')).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('无附加条件，达成后即可结算')).toBeInTheDocument();
  });

  it('分页：任务超过一页时可翻到下一批', () => {
    const harness = setup((h) => {
      h.root.quest.quests = Array.from({ length: 7 }, (_value, index) =>
        makeQuest({ code: `quest_${index + 1}`, name: `任务${index + 1}`, orderIndex: index + 1 }),
      );
      h.root.quest.total = 7;
    });
    harness.render(<QuestPanel />);

    expect(screen.getByTestId('quest-card-quest_1')).toBeInTheDocument();
    expect(screen.queryByTestId('quest-card-quest_7')).toBeNull();

    fireEvent.click(screen.getByTitle('2'));
    expect(screen.getByTestId('quest-card-quest_7')).toBeInTheDocument();
    expect(screen.queryByTestId('quest-card-quest_1')).toBeNull();
  });
});

describe('QuestPanel · 三态与章节解锁', () => {
  it('空态：没有任务时给出引导文案', () => {
    const harness = createPanelHarness();
    harness.render(<QuestPanel />);

    expect(screen.getByText('暂无任务，先去秘境历练')).toBeInTheDocument();
    expect(screen.getByText('暂无章节数据')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.quest.loading = true;
    });
    const view = harness.render(<QuestPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.quest.loading = false;
      harness.root.quest.error = '任务加载失败';
    });
    harness.render(<QuestPanel />);
    expect(screen.getByText('任务加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('已解锁章节显示任务进度', () => {
    const harness = setup();
    harness.render(<QuestPanel />);

    expect(screen.getByTestId('chapter-card-chapter_1')).toHaveTextContent('任务进度 1 / 2');
    expect(screen.queryByTestId('chapter-locked-chapter_1')).toBeNull();
  });

  it('境界不足的章节用 LockedHint 说明「需要 / 当前」', () => {
    const harness = setup((h) => {
      h.root.quest.chapters = [
        makeChapter(),
        makeChapter({
          code: 'chapter_2',
          chapter: 2,
          name: '第二章 · 筑基',
          unlocked: false,
          unlockedReason: 'realm',
          minRealm: 5,
        }),
      ];
    });
    harness.render(<QuestPanel />);

    const locked = screen.getByTestId('chapter-locked-chapter_2');
    expect(locked).toHaveTextContent('境界不足');
    expect(locked).toHaveTextContent('需要 5 · 当前 2');
  });

  it('前置未满足的章节说明需先完成哪一章（不显示前置 code）', () => {
    const harness = setup((h) => {
      h.root.quest.chapters = [
        makeChapter(),
        makeChapter({
          code: 'chapter_2',
          chapter: 2,
          name: '第二章 · 筑基',
          unlocked: false,
          unlockedReason: 'prev',
          requiresChapter: 'chapter_1',
        }),
      ];
    });
    harness.render(<QuestPanel />);

    expect(screen.getByTestId('chapter-locked-chapter_2')).toHaveTextContent('需先完成「第一章 · 入门」');
    expect(document.body.textContent ?? '').not.toContain('chapter_1');
  });
});

describe('QuestPanel · 做完得到什么', () => {
  it('一键结算经确认后依次发出 quest.sync 与 quest.chapterSync', async () => {
    const harness = setup();
    harness.render(<QuestPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('quest-sync-all'));
    await userEvent.click(await screen.findByRole('button', { name: /^结\s*算$/ }));

    await waitFor(() => {
      expect(
        harness.requests.filter((r) => r.cmd === QUEST_CMD.cmd && r.subCmd === QUEST_CMD.sync),
      ).toHaveLength(1);
      expect(
        harness.requests.filter((r) => r.cmd === QUEST_CMD.cmd && r.subCmd === QUEST_CMD.chapterSync),
      ).toHaveLength(1);
    });
  });

  it('无结算记录时不渲染结算卡', () => {
    const harness = setup();
    harness.render(<QuestPanel />);
    expect(screen.queryByTestId('quest-settlement')).toBeNull();
  });

  it('store 契约：quest.detail 失败返回 null 并写入 error（面板不消费详情，仅保契约覆盖）', async () => {
    const harness = createPanelHarness();
    await harness.connect();

    const detail = await harness.root.quest.detail('quest_a');

    expect(detail).toBeNull();
    expect(harness.root.quest.error).not.toBeNull();
  });

  it('store 契约：quest.chapterDetail 失败返回 null，章节同步仍照发', async () => {
    const harness = createPanelHarness();
    await harness.connect();

    expect(await harness.root.quest.chapterDetail('chapter_1')).toBeNull();
    await harness.root.quest.chapterSync();

    expect(
      harness.requests.filter((r) => r.cmd === QUEST_CMD.cmd && r.subCmd === QUEST_CMD.chapterSync),
    ).toHaveLength(1);
  });

  it('最近结算展示灵韵 / 灵石 / 玉简与通货中文名', () => {
    const harness = setup((h) => {
      h.root.quest.lastSync = makeSync({ totals: { lingyun: 100, spiritStones: 20, jadeSlips: 5, currencies: { chaos: 2 }, essences: {} } });
      h.root.economy.currencies = [makeCurrency()];
    });
    harness.render(<QuestPanel />);

    const settlement = screen.getByTestId('quest-settlement');
    expect(settlement).toHaveTextContent('灵韵');
    expect(settlement).toHaveTextContent('混沌石 ×2');
    const extra = screen.getByTestId('quest-settlement-extra');
    expect(extra).toHaveTextContent('已结算任务');
    expect(extra).toHaveTextContent('灵石');
    expect(extra).toHaveTextContent('玉简');
    expect(extra).toHaveTextContent('发放条目');
    expect(document.body.textContent ?? '').not.toContain('chaos');
  });
});
