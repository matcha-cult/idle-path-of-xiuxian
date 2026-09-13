/**
 * PanelPlaceholder：标题/状态标签/说明/要点列表/默认文案。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelPlaceholder } from './index.js';

describe('PanelPlaceholder', () => {
  it('渲染标题、说明与默认状态标签「重做中」', () => {
    render(<PanelPlaceholder title="秘境" description="按层推进，结算掉落与灵韵" />);
    expect(screen.getByText('秘境')).toBeInTheDocument();
    expect(screen.getByText('按层推进，结算掉落与灵韵')).toBeInTheDocument();
    expect(screen.getByTestId('panel-placeholder-status')).toHaveTextContent('重做中');
  });

  it('status=planned 时标签为「排队中」', () => {
    render(<PanelPlaceholder title="剧情" status="planned" />);
    expect(screen.getByTestId('panel-placeholder-status')).toHaveTextContent('排队中');
  });

  it('highlights 渲染为标签列表', () => {
    render(<PanelPlaceholder title="背包" highlights={['筛选与排序', '物品详情抽屉', '批量操作']} />);
    const wrap = screen.getByTestId('panel-placeholder-highlights');
    expect(wrap).toHaveTextContent('筛选与排序');
    expect(wrap).toHaveTextContent('批量操作');
  });

  it('无 highlights 时显示默认说明文案', () => {
    render(<PanelPlaceholder title="设置" />);
    expect(screen.getByText(/信息卡 \+ 行动区 \+ 结算成果/)).toBeInTheDocument();
  });

  it('highlights 为空数组时同样走默认文案', () => {
    render(<PanelPlaceholder title="设置" highlights={[]} />);
    expect(screen.queryByTestId('panel-placeholder-highlights')).toBeNull();
    expect(screen.getByText(/信息卡 \+ 行动区 \+ 结算成果/)).toBeInTheDocument();
  });

  it('自定义 icon 透传', () => {
    render(<PanelPlaceholder title="战斗" icon={<span data-testid="custom-icon">⚔</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});
