/**
 * StoryPanel 测试：纯展示用 `harness.seed()`，交互用 `harness.requests` 断言「点击 → 真的发 WS Action」。
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { STORY_CMD } from '@idle-path/ionet-transport';
import type { StoryNode } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { StoryPanel } from './StoryPanel.js';

function makeNode(overrides: Partial<StoryNode> = {}): StoryNode {
  return {
    nodeKey: 'chapter:c3:intro', type: 'chapter_intro', text: '天地初开，灵气复苏。', seen: false,
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
  nodes: [makeNode({ nodeKey: 'quest:q1:start', type: 'quest_start', text: '任务开场。' })],
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

describe('StoryPanel', () => {
  it('渲染章节摘要与节点表格（节点/类型/文本/已读）', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.story.chapter = { code: 'c3', name: '第三章', chapter: 3 };
      harness.root.story.nodes = [makeNode()];
    });
    harness.render(<StoryPanel />);

    expect(screen.getByText(/第 3 章 · 第三章（c3）/)).toBeInTheDocument();
    expect(screen.getByText('chapter:c3:intro')).toBeInTheDocument();
    expect(screen.getByText('chapter_intro')).toBeInTheDocument();
    expect(screen.getByText('天地初开，灵气复苏。')).toBeInTheDocument();
    expect(screen.getByText('未读')).toBeInTheDocument();
    expect(screen.getByTestId('story-node-count')).toHaveTextContent('章节 1 · 任务 0');
  });

  it('chapter 为 null 且节点为空时显示空态而非崩溃', () => {
    const harness = createPanelHarness();
    harness.render(<StoryPanel />);

    expect(screen.getByText('未加载章节')).toBeInTheDocument();
    expect(screen.getByText('暂无剧情节点，先加载章节或任务')).toBeInTheDocument();
    expect(screen.getByTestId('story-node-count')).toHaveTextContent('章节 0 · 任务 0');
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

  it('输入章节并点击「加载章节」→ 经 WS 发出 story.chapter 且落地节点', async () => {
    const harness = createPanelHarness({ handler: storyHandler });
    harness.render(<StoryPanel />);
    await harness.connect();

    await userEvent.clear(screen.getByTestId('story-chapter-input'));
    await userEvent.type(screen.getByTestId('story-chapter-input'), '3');
    await userEvent.click(screen.getByTestId('story-load-chapter'));

    const sent = harness.requests.filter(
      (r) => r.cmd === STORY_CMD.cmd && r.subCmd === STORY_CMD.chapter,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.data).toEqual({ chapter: '3' });
    expect(await screen.findByText('第三章开场。')).toBeInTheDocument();
  });

  it('输入任务 code 并点击「加载任务」→ 经 WS 发出 story.quest', async () => {
    const harness = createPanelHarness({ handler: storyHandler });
    harness.render(<StoryPanel />);
    await harness.connect();

    await userEvent.type(screen.getByTestId('story-quest-input'), 'q1');
    await userEvent.click(screen.getByTestId('story-load-quest'));

    const sent = harness.requests.filter((r) => r.cmd === STORY_CMD.cmd && r.subCmd === STORY_CMD.quest);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.data).toEqual({ code: 'q1' });
    expect(await screen.findByText('任务开场。')).toBeInTheDocument();
  });

  it('点击「标记已读」→ 经 WS 发出 story.seen 且本地 seen 同步为已读', async () => {
    const harness = createPanelHarness({ handler: storyHandler });
    harness.seed(() => {
      harness.root.story.nodes = [makeNode()];
    });
    harness.render(<StoryPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('story-seen-chapter:c3:intro'));

    const sent = harness.requests.filter((r) => r.cmd === STORY_CMD.cmd && r.subCmd === STORY_CMD.seen);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.data).toEqual({ nodeKey: 'chapter:c3:intro' });
    expect(await screen.findByText('已读')).toBeInTheDocument();
  });
});
