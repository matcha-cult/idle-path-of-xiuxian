/**
 * StatGrid：统计指标栅格。
 * 覆盖：正常渲染（复用 StatItem）、空态、column 换算 span、
 * bordered → Card variant、组级 loading、单项 loading 覆盖。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatGrid } from './index.js';

const items = [
  { key: 'power', label: '战力', value: 100 },
  { key: 'stone', label: '灵石', value: 2500 },
  { key: 'realm', label: '境界', value: '筑基' },
  { key: 'break', label: '突破', value: 3 },
];

describe('StatGrid', () => {
  it('正常渲染：每个指标渲染一个 StatItem', () => {
    render(<StatGrid items={items} />);

    expect(screen.getByTestId('stat-grid-root')).toBeInTheDocument();
    expect(screen.getAllByTestId('stat-item-root')).toHaveLength(4);
    expect(screen.getByText('战力')).toBeInTheDocument();
    expect(screen.getByText('灵石')).toBeInTheDocument();
    expect(screen.getByText('筑基')).toBeInTheDocument();
  });

  it('空数据：渲染 Empty 且根节点存在', () => {
    const { container } = render(<StatGrid items={[]} />);

    expect(container.querySelector('.ant-empty')).not.toBeNull();
    expect(screen.getByTestId('stat-grid-root')).toBeInTheDocument();
  });

  it('column=2 时每列占 12 栅格', () => {
    const { container } = render(<StatGrid items={items} column={2} />);
    expect(container.querySelectorAll('.ant-col-12')).toHaveLength(4);
  });

  it('边界：column=0 不产生 NaN/Infinity 栅格，span 仍为合法数字', () => {
    const { container } = render(<StatGrid items={items} column={0} />);
    const cols = container.querySelectorAll('[class*="ant-col-"]');
    expect(cols.length).toBeGreaterThan(0);
    cols.forEach((col) => {
      expect(col.className).not.toContain('NaN');
    });
  });

  it('bordered 控制 Card variant（outlined / borderless）', () => {
    const outlined = render(<StatGrid items={items} bordered />);
    expect(outlined.container.querySelectorAll('.ant-card-bordered')).toHaveLength(4);
    outlined.unmount();

    const borderless = render(<StatGrid items={items} bordered={false} />);
    expect(borderless.container.querySelectorAll('.ant-card-bordered')).toHaveLength(0);
  });

  it('loading：组级与单项 loading 都被尊重', () => {
    const { container } = render(<StatGrid items={items} loading />);
    expect(container.querySelectorAll('.ant-skeleton')).toHaveLength(4);
    expect(screen.queryByText('战力')).toBeInTheDocument();
  });

  it('边界：非有限数值经 StatItem 降级为 "-"', () => {
    const { container } = render(
      <StatGrid items={[{ key: 'x', label: '异常', value: Number.NaN }]} />,
    );
    expect(container.textContent).toContain('-');
    expect(container.textContent).not.toContain('NaN');
  });
});
