/**
 * EmptyHint：默认/自定义描述、action 插槽、compact 小图。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyHint } from './index.js';

describe('EmptyHint · 文案', () => {
  it('缺省描述为「暂无数据」', () => {
    render(<EmptyHint />);

    const root = screen.getByTestId('empty-hint-root');
    expect(root).toHaveClass('ant-empty');
    expect(root).toHaveTextContent('暂无数据');
  });

  it('自定义 description（含 ReactNode）生效', () => {
    render(<EmptyHint description={<span data-testid="custom-desc">背包空空如也</span>} />);

    expect(screen.getByTestId('custom-desc')).toHaveTextContent('背包空空如也');
    expect(screen.getByTestId('empty-hint-root')).not.toHaveTextContent('暂无数据');
  });
});

describe('EmptyHint · 插槽与形态', () => {
  it('action 插槽渲染且可点击', async () => {
    const onClick = vi.fn();
    render(
      <EmptyHint
        description="尚未开采"
        action={
          <button type="button" onClick={onClick}>
            前往矿脉
          </button>
        }
      />,
    );

    const action = screen.getByRole('button', { name: '前往矿脉' });
    await userEvent.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('缺省 action 时不渲染 footer 区块', () => {
    const { container } = render(<EmptyHint />);
    expect(container.querySelector('.ant-empty-footer')).toBeNull();
  });

  it('compact 使用 SIMPLE 小图且不崩', () => {
    const { container: compact } = render(<EmptyHint compact />);
    const { container: normal } = render(<EmptyHint />);

    const compactImage = compact.querySelector('.ant-empty-image')?.innerHTML ?? '';
    const normalImage = normal.querySelector('.ant-empty-image')?.innerHTML ?? '';
    expect(compactImage).not.toBe('');
    expect(compactImage).not.toBe(normalImage);
    // antd 用 `-normal` class 标记 SIMPLE 图。
    expect(compact.querySelector('[data-testid="empty-hint-root"]')).toHaveClass('ant-empty-normal');
    expect(normal.querySelector('[data-testid="empty-hint-root"]')).not.toHaveClass('ant-empty-normal');
  });
});
