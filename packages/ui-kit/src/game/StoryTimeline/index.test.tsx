/**
 * StoryTimeline：节点文本 / 类型中文标签、未读-已读状态与圆点色、loading / 空态，
 * 以及 onSeen 受控回调、节点点击与键盘可访问性。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StoryTimeline, type StoryNodeView } from './index.js';

const node = (nodeKey: string, overrides: Partial<StoryNodeView> = {}): StoryNodeView => ({
  nodeKey,
  text: `正文-${nodeKey}`,
  ...overrides,
});

describe('StoryTimeline · 渲染', () => {
  it('正常渲染节点文本与类型中文标签，未知类型原样显示', () => {
    render(
      <StoryTimeline
        nodes={[
          node('n1', { type: 'chapter_intro' }),
          node('n2', { type: 'quest_done' }),
          node('n3', { type: 'custom_node' }),
        ]}
      />,
    );

    expect(screen.getByTestId('story-timeline-root')).toBeInTheDocument();
    expect(screen.getAllByTestId('story-timeline-text').map((n) => n.textContent)).toEqual([
      '正文-n1',
      '正文-n2',
      '正文-n3',
    ]);
    expect(screen.getByText('章节·序')).toBeInTheDocument();
    expect(screen.getByText('任务·终')).toBeInTheDocument();
    expect(screen.getByText('custom_node')).toBeInTheDocument();
  });

  it('showSeen 缺省：未读标「未读」并高亮圆点，已读标「已读」用次要圆点色', () => {
    const { container } = render(
      <StoryTimeline nodes={[node('n1'), node('n2', { seen: true })]} />,
    );

    expect(screen.getAllByTestId('story-timeline-node')[0]).toHaveAttribute('data-unread', 'true');
    expect(screen.getAllByTestId('story-timeline-node')[1]).toHaveAttribute('data-unread', 'false');
    expect(screen.getByTestId('story-timeline-unread')).toHaveTextContent('未读');
    expect(screen.getByTestId('story-timeline-seen')).toHaveTextContent('已读');
    expect(container.querySelectorAll('.ant-timeline-item-color-blue')).toHaveLength(1);
    expect(container.querySelectorAll('.ant-timeline-item-color-gray')).toHaveLength(1);
  });

  it('seen 未传按未读处理', () => {
    render(<StoryTimeline nodes={[node('n1', { seen: undefined })]} />);

    expect(screen.getByTestId('story-timeline-node')).toHaveAttribute('data-unread', 'true');
    expect(screen.getByTestId('story-timeline-unread')).toBeInTheDocument();
  });

  it('showSeen=false 时不渲染读态标签，圆点统一用次要色', () => {
    const { container } = render(<StoryTimeline nodes={[node('n1')]} showSeen={false} />);

    expect(screen.queryByTestId('story-timeline-unread')).toBeNull();
    expect(screen.queryByTestId('story-timeline-seen')).toBeNull();
    expect(container.querySelectorAll('.ant-timeline-item-color-gray')).toHaveLength(1);
  });

  it('空列表：渲染缺省「暂无剧情」，可用 emptyText 覆盖', () => {
    const { unmount } = render(<StoryTimeline nodes={[]} />);
    expect(screen.getByTestId('story-timeline-empty')).toHaveTextContent('暂无剧情');
    unmount();

    render(<StoryTimeline nodes={[]} emptyText="尚无剧本" />);
    expect(screen.getByTestId('story-timeline-empty')).toHaveTextContent('尚无剧本');
    expect(screen.queryByTestId('story-timeline-root')).toBeNull();
  });

  it('loading 渲染骨架且不渲染节点（空列表时同样优先）', () => {
    const { unmount } = render(<StoryTimeline nodes={[node('n1')]} loading />);
    expect(screen.getByTestId('story-timeline-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('story-timeline-node')).toBeNull();
    expect(screen.queryByTestId('story-timeline-root')).toBeNull();
    unmount();

    render(<StoryTimeline nodes={[]} loading />);
    expect(screen.getByTestId('story-timeline-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('story-timeline-empty')).toBeNull();
  });

  it('边界：text 为空串不崩，type 缺省 / 空串省略类型标签', () => {
    render(<StoryTimeline nodes={[node('n1', { text: '', type: '' }), node('n2', { type: undefined })]} />);

    expect(screen.getAllByTestId('story-timeline-node')).toHaveLength(2);
    expect(screen.getAllByTestId('story-timeline-text').map((n) => n.textContent)).toEqual(['', '正文-n2']);
    expect(screen.queryByTestId('story-timeline-type')).toBeNull();
  });
});

describe('StoryTimeline · 交互', () => {
  it('onSeen 只回调、不自行改状态（受控）', async () => {
    const onSeen = vi.fn();
    render(<StoryTimeline nodes={[node('n1', { onSeen })]} />);

    const before = screen.getByTestId('story-timeline-node');
    expect(before).toHaveAttribute('data-unread', 'true');

    await userEvent.click(screen.getByTestId('story-timeline-mark-seen'));
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('story-timeline-node')).toHaveAttribute('data-unread', 'true');
    expect(screen.getByTestId('story-timeline-unread')).toBeInTheDocument();
  });

  it('无 onSeen 时不渲染「标记已读」入口', () => {
    render(<StoryTimeline nodes={[node('n1')]} />);

    expect(screen.queryByTestId('story-timeline-mark-seen')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('节点 onClick：鼠标点击与键盘 Enter 均可触发', async () => {
    const onClick = vi.fn();
    render(<StoryTimeline nodes={[node('n1', { onClick })]} />);

    const text = screen.getByRole('button', { name: '正文-n1' });
    await userEvent.click(text);
    expect(onClick).toHaveBeenCalledTimes(1);

    text.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);

    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);

    // 其它按键不触发
    await userEvent.keyboard('{Escape}');
    expect(onClick).toHaveBeenCalledTimes(3);
  });
});
