/**
 * QuestPanel 测试：渲染 / 空态 / 三态 / 交互真发请求 / 边界（lastSync=null）。
 * 交互用例必须先 `await harness.connect()`；seed 一律在 `harness.seed()` 内。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QUEST_CMD } from '@idle-path/ionet-transport';
import type { ChapterView, QuestSyncData, QuestView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { QuestPanel } from './QuestPanel.js';

function makeQuest(overrides: Partial<QuestView> = {}): QuestView {
  return {
    code: 'quest_a', chapter: 1, name: '初入江湖', orderIndex: 1,
    status: 'active', claimable: false, objectives: [],
    ...overrides,
  };
}

function makeChapter(overrides: Partial<ChapterView> = {}): ChapterView {
  return {
    code: 'chapter_1', chapter: 1, name: '第一章 · 入门', theme: null, minRealm: 1,
    zoneCode: 'zone_a', requiresChapter: null, orderIndex: 1, unlocked: true,
    unlockedReason: 'ok', completed: false, quests: { total: 2, completed: 1 },
    ...overrides,
  };
}

const SYNC: QuestSyncData = {
  completedCount: 3, completed: [], granted: [],
  totals: { lingyun: 100, spiritStones: 20, jadeSlips: 5, currencies: {}, essences: {} },
};

describe('QuestPanel', () => {
  it('渲染任务列表与概览：编码 / 名称 / 状态 / 章节数 / lastSync 空态', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.quest.quests = [makeQuest()];
      harness.root.quest.total = 5;
      harness.root.quest.completed = 2;
      harness.root.quest.chapters = [makeChapter()];
      harness.root.quest.currentChapter = 1;
    });
    harness.render(<QuestPanel />);

    expect(screen.getByText('quest_a')).toBeInTheDocument();
    expect(screen.getByText('初入江湖')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('已完成 2 / 共 5')).toBeInTheDocument();
    expect(screen.getByTestId('quest-last-sync')).toHaveTextContent('尚未同步');
  });

  it('空任务列表显示空态', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.quest.quests = [];
      harness.root.quest.currentChapter = null;
    });
    harness.render(<QuestPanel />);

    expect(screen.getByText('暂无任务')).toBeInTheDocument();
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

  it('点击「详情」经 WS 发出 quest.detail（code 正确）', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.quest.quests = [makeQuest()];
    });
    harness.render(<QuestPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('quest-detail-quest_a'));

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === QUEST_CMD.cmd && r.subCmd === QUEST_CMD.detail);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ code: 'quest_a' });
    });
  });

  it('点击「同步任务奖励」并确认后经 WS 发出 quest.sync', async () => {
    const harness = createPanelHarness();
    harness.render(<QuestPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('quest-sync'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === QUEST_CMD.cmd && r.subCmd === QUEST_CMD.sync);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({});
    });
  });

  it('点击「同步章节奖励」发出 quest.chapterSync；lastSync 非空展示灵韵/灵石/玉简', async () => {
    const harness = createPanelHarness();
    harness.render(<QuestPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('quest-chapter-sync'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const sent = harness.requests.filter(
        (r) => r.cmd === QUEST_CMD.cmd && r.subCmd === QUEST_CMD.chapterSync,
      );
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({});
    });

    harness.seed(() => {
      harness.root.quest.lastSync = SYNC;
    });
    await waitFor(() => expect(screen.getByTestId('quest-last-sync')).toHaveTextContent('灵石'));
    const box = screen.getByTestId('quest-last-sync');
    expect(within(box).getByText('已完成任务')).toBeInTheDocument();
    expect(within(box).getByText('100')).toBeInTheDocument();
    expect(within(box).getByText('5')).toBeInTheDocument();
  });
});
