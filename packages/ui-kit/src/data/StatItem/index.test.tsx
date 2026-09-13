/**
 * StatItem：单项统计。
 * 覆盖：正常渲染（label/value/prefix/suffix/precision）、非有限数降级 `'-'`、
 * loading 骨架、valueStyle 映射、字符串直通。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatItem } from './index.js';

describe('StatItem', () => {
  it('正常渲染：标签、数值、前后缀与精度', () => {
    const { container } = render(
      <StatItem label="战力" value={1234.5} precision={2} prefix={<span>⚔</span>} suffix="点" />,
    );

    expect(screen.getByTestId('stat-item-root')).toBeInTheDocument();
    expect(screen.getByText('战力')).toBeInTheDocument();
    expect(screen.getByText('点')).toBeInTheDocument();
    // antd v6 Statistic 的 precision 为「截断补零」而非四舍五入
    expect(container.textContent).toContain('1,234.50');
  });

  it('边界：NaN / Infinity / -Infinity 统一显示 "-"，不出现 NaN 字样', () => {
    const cases: number[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    const { container, unmount } = render(<StatItem label="异常" value={cases[0]!} />);
    expect(container.textContent).toContain('-');
    expect(container.textContent).not.toContain('NaN');
    unmount();

    for (const value of cases.slice(1)) {
      const view = render(<StatItem label="异常" value={value} precision={2} />);
      expect(view.container.textContent).toContain('-');
      expect(view.container.textContent).not.toContain('Infinity');
      view.unmount();
    }
  });

  it('边界：字符串值直通，不参与数值格式化', () => {
    const { container } = render(<StatItem label="状态" value="未知" precision={2} />);
    expect(container.textContent).toContain('未知');
  });

  it('边界：0 与负数正常渲染（0 不被当作空值）', () => {
    const zero = render(<StatItem label="零" value={0} />);
    expect(zero.container.textContent).toContain('0');
    zero.unmount();

    const negative = render(<StatItem label="负" value={-12} />);
    expect(negative.container.textContent).toContain('-12');
  });

  it('loading：渲染骨架且不渲染数值', () => {
    const { container } = render(<StatItem label="战力" value={999} loading />);
    expect(container.querySelector('.ant-skeleton')).not.toBeNull();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
  });

  it('valueStyle 映射到数值区样式', () => {
    const { container } = render(
      <StatItem label="战力" value={1} valueStyle={{ color: 'rgb(1, 2, 3)' }} />,
    );
    const content = container.querySelector('.ant-statistic-content');
    expect(content).not.toBeNull();
    expect((content as HTMLElement).style.color).toBe('rgb(1, 2, 3)');
  });
});
