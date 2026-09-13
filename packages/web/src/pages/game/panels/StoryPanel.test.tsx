/**
 * StoryPanel（新版·玩法驱动）测试。
 * 重点：章节目录是否来自任务域、点击是否真发 story.chapter / story.quest、
 * 「标记已读」是否真发 story.seen 并落地，以及 `nodeKey` / `questCode` 是否真的没上屏。
 * 常量一律从 transport 导入（不写字面量），交互用例必须先 `await harness.connect()`。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { STORY_CMD } from '@idle-path/ionet-transport';
import type { ChapterView, QuestView, StoryNode } from '@idle-path/ionet-transport';
import { createPanelHarness, type PanelHarness } from '../../../../test/helpers/panel-harness.js';
import { StoryPanel } from './StoryPanel.js';

function makeChapter(overrides: Partial<ChapterView> = {}): ChapterView {
  return {
    code: 'c3',
    chapter: 3,
    name: '第三章',
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

function makeNode(overrides: Partial<StoryNode> = {}): StoryNode {
  return {
    nodeKey: 'chapter:c3:intro',
    type: 'chapter_intro',
    text: '天地初开，灵气复苏。',
    seen: false,
    ...overrides,
  };
}

type Req = { cmd: number; subCmd: number; data?: unknown };
const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });
const CHAPTER = {
  chapter: { code: 'c3', name: '第三章', chapter: 3 },
  nodes: [makeNode({ text: '第三章开场。' })],
};
const QUEST = {
  quest: { code: 'q1', name: '初入江湖', status: 'active' },
  nodes: [makeNode({ nodeKey: 'quest:q1:start', type: 'quest_start', text: '任务开场。', questCode: 'q1' })],
};

/** 剧情段假服务端：chapter / quest / seen 三支都回成功体。 */
function storyHandler(request: Req) {
  if (request.cmd !== STORY_CMD.cmd) return null;
  if (request.subCmd === STORY_CMD.chapter) return ok(CHAPTER);
  if (request.subCmd === STORY_CMD.quest) return ok(QUEST);
  if (request.subCmd === STORY_CMD.seen) {
    return ok({ nodeKey: (request.data as { nodeKey: string }).nodeKey, seen: true });
  }
  return null;
}

/** 章节目录来自 quest 域，任务目录同样复用 quest 列表。 */
function setup(seedFn?: (harness: PanelHarness) => void): PanelHarness {
  const harness = createPanelHarness({ handler: storyHandler });
  harness.seed(() => {
    harness.root.quest.chapters = [makeChapter()];
    harness.root.quest.quests = [makeQuest()];
    seedFn?.(harness);
  });
  return harness;
}

describe('StoryPanel · 目录与读取剧本', () => {
  it('章节目录展示「第 N 章 · 名称」，点击后发出 story.chapter 并渲染时间线', async () => {
    const harness = setup();
    harness.render(<StoryPanel />);
    await harness.connect();

    expect(screen.getByTestId('story-chapter-c3')).toHaveTextContent('第 3 章 · 第三章');

    await userEvent.click(screen.getByTestId('story-chapter-c3'));

    expect(await screen.findByText('第三章开场。')).toBeInTheDocument();
    expect(screen.getByText('章节·序')).toBeInTheDocument();
    expect(screen.getByText('未读')).toBeInTheDocument();

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === STORY_CMD.cmd && r.subCmd === STORY_CMD.chapter);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ chapter: 'c3' });
    });
  });

  it('任务目录点击后发出 story.quest，标题用任务名而非 code', async () => {
    const harness = setup();
    harness.render(<StoryPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('story-quest-q1'));

    expect(await screen.findByText('任务开场。')).toBeInTheDocument();
    expect(screen.getByText('任务剧本 · 初入江湖')).toBeInTheDocument();

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === STORY_CMD.cmd && r.subCmd === STORY_CMD.quest);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ code: 'q1' });
    });
    expect(document.body.textContent ?? '').not.toContain('q1');
  });

  it('「标记已读」发出 story.seen 并本地落地为已读', async () => {
    const harness = setup((h) => {
      h.root.story.chapter = { code: 'c3', name: '第三章', chapter: 3 };
      h.root.story.nodes = [makeNode()];
    });
    harness.render(<StoryPanel />);
    await harness.connect();

    expect(screen.getByTestId('story-timeline-unread')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('story-timeline-mark-seen'));

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === STORY_CMD.cmd && r.subCmd === STORY_CMD.seen);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ nodeKey: 'chapter:c3:intro' });
    });

    expect(await screen.findByTestId('story-timeline-seen')).toBeInTheDocument();
    expect(screen.queryByTestId('story-timeline-mark-seen')).toBeNull();
  });

  it('未读数写进章节标题', () => {
    const harness = setup((h) => {
      h.root.story.chapter = { code: 'c3', name: '第三章', chapter: 3 };
      h.root.story.nodes = [makeNode(), makeNode({ nodeKey: 'chapter:c3:outro', type: 'chapter_outro', seen: true })];
    });
    harness.render(<StoryPanel />);

    expect(screen.getByTestId('story-chapter-timeline')).toHaveTextContent('章节剧本 · 第三章（未读 1）');
  });
});

describe('StoryPanel · 三态与边界', () => {
  it('空态：未选剧本时提示从目录选择，而不是空白', () => {
    const harness = createPanelHarness();
    harness.render(<StoryPanel />);

    expect(screen.getByText('从左侧目录选择章节或任务开始阅读')).toBeInTheDocument();
    expect(screen.getByText('暂无可选章节')).toBeInTheDocument();
    expect(screen.getByText('暂无任务剧本')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.story.loading = true;
    });
    const view = harness.render(<StoryPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.story.loading = false;
      harness.root.story.error = '章节剧情加载失败';
    });
    harness.render(<StoryPanel />);
    expect(screen.getByText('章节剧情加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('边界：节点文本为空串不崩、未知/空类型不打类型标签、seen 缺省按未读', () => {
    const harness = setup((h) => {
      h.root.story.chapter = { code: 'c3', name: '第三章', chapter: 3 };
      h.root.story.nodes = [makeNode({ text: '', type: '' })];
    });
    harness.render(<StoryPanel />);

    expect(screen.getByTestId('story-timeline-node')).toHaveAttribute('data-unread', 'true');
    expect(screen.getAllByTestId('story-timeline-text')).toHaveLength(1);
    expect(screen.queryByTestId('story-timeline-type')).toBeNull();
    expect(screen.getByTestId('story-timeline-unread')).toBeInTheDocument();
  });

  it('协议字段不上屏：nodeKey / questCode / 字段名都不出现在页面文本', () => {
    const harness = setup((h) => {
      h.root.story.chapter = { code: 'c3', name: '第三章', chapter: 3 };
      h.root.story.nodes = [makeNode()];
      h.root.story.questNodes = [
        makeNode({ nodeKey: 'quest:q9:start', type: 'quest_start', text: '任务开场。', questCode: 'quest_x9' }),
      ];
    });
    harness.render(<StoryPanel />);

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('chapter:c3:intro');
    expect(text).not.toContain('quest:q9:start');
    expect(text).not.toContain('quest_x9');
    expect(text).not.toContain('nodeKey');
    expect(text).not.toContain('questCode');
    // 任务节点照常显示正文与类型中文标签
    expect(within(screen.getByTestId('story-quest-timeline')).getByText('任务开场。')).toBeInTheDocument();
    expect(within(screen.getByTestId('story-quest-timeline')).getByText('任务·始')).toBeInTheDocument();
  });
});
