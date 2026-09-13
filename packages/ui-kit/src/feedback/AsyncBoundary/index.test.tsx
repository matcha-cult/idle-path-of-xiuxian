/**
 * AsyncBoundary：四态统一门。
 * 覆盖：四态优先级（loading > error > empty > children）、onRetry 回调、
 * 无 onRetry 时不渲染重试按钮、文案与骨架行数覆盖。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AsyncBoundary } from './index.js';

describe('AsyncBoundary', () => {
  it('优先级：同时 loading + error 时只显示加载骨架', () => {
    render(
      <AsyncBoundary loading error="炸了">
        <span>正文</span>
      </AsyncBoundary>,
    );

    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-error')).not.toBeInTheDocument();
    expect(screen.queryByText('炸了')).not.toBeInTheDocument();
    expect(screen.queryByText('正文')).not.toBeInTheDocument();
  });

  it('优先级：同时 error + empty 时只显示错误态', () => {
    render(
      <AsyncBoundary error="炸了" empty>
        <span>正文</span>
      </AsyncBoundary>,
    );

    expect(screen.getByTestId('async-boundary-error')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
    expect(screen.queryByText('正文')).not.toBeInTheDocument();
  });

  it('优先级：empty + children 时显示空态而非 children', () => {
    render(
      <AsyncBoundary empty>
        <span>正文</span>
      </AsyncBoundary>,
    );

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.queryByText('正文')).not.toBeInTheDocument();
  });

  it('正常态：四态信号皆无时显示 children', () => {
    render(
      <AsyncBoundary>
        <span>正文</span>
      </AsyncBoundary>,
    );

    expect(screen.getByText('正文')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
  });

  it('错误态：onRetry 存在时点「重试」回调一次', async () => {
    const onRetry = vi.fn();
    render(<AsyncBoundary error="网络断开" onRetry={onRetry} children={null} />);

    const retry = screen.getByTestId('async-boundary-retry');
    expect(retry).toHaveTextContent(/重\s*试/);
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('错误态：无 onRetry 时不渲染重试按钮', () => {
    render(<AsyncBoundary error="网络断开" children={null} />);

    expect(screen.getByTestId('async-boundary-error')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-retry')).not.toBeInTheDocument();
  });

  it('边界：error 为 undefined / null / false / 空串都不进入错误态', () => {
    const { rerender } = render(<AsyncBoundary error={undefined}>正文</AsyncBoundary>);
    expect(screen.getByText('正文')).toBeInTheDocument();

    rerender(<AsyncBoundary error={null}>正文</AsyncBoundary>);
    expect(screen.getByText('正文')).toBeInTheDocument();

    rerender(<AsyncBoundary error={false}>正文</AsyncBoundary>);
    expect(screen.getByText('正文')).toBeInTheDocument();

    rerender(<AsyncBoundary error="">正文</AsyncBoundary>);
    expect(screen.getByText('正文')).toBeInTheDocument();
  });

  it('插槽：emptyText / retryText / skeletonRows 可覆盖', () => {
    const { container, rerender } = render(<AsyncBoundary empty emptyText="还没有记录" children={null} />);
    expect(screen.getByText('还没有记录')).toBeInTheDocument();

    rerender(<AsyncBoundary error="err" retryText="再试一次" onRetry={vi.fn()} children={null} />);
    expect(screen.getByTestId('async-boundary-retry')).toHaveTextContent('再试一次');

    rerender(<AsyncBoundary loading skeletonRows={5} children={null} />);
    expect(container.querySelectorAll('.ant-skeleton-paragraph > li')).toHaveLength(5);
  });
});
