/**
 * KeyValueList：键值明细。
 * 覆盖：正常渲染、空态、column（数字 / 断点映射）/layout/bordered 透传、title、值为富节点。
 */
import { render, screen } from '@testing-library/react';
import { Tag } from 'antd';
import { describe, expect, it } from 'vitest';
import { setViewportWidth } from '../../testing/viewport.js';
import { KeyValueList } from './index.js';

const items = [
  { key: 'realm', label: '境界', value: '筑基三层' },
  { key: 'spirit', label: '灵石', value: 1280 },
  { key: 'state', label: '状态', value: <Tag color="green">闭关</Tag> },
];

describe('KeyValueList', () => {
  it('正常渲染：标签与值成对出现', () => {
    render(<KeyValueList items={items} />);

    expect(screen.getByTestId('key-value-list-root')).toBeInTheDocument();
    expect(screen.getByText('境界')).toBeInTheDocument();
    expect(screen.getByText('筑基三层')).toBeInTheDocument();
    expect(screen.getByText('灵石')).toBeInTheDocument();
    expect(screen.getByText('1280')).toBeInTheDocument();
  });

  it('空数据：渲染 emptyText 与根节点', () => {
    render(<KeyValueList items={[]} emptyText="暂无属性" />);

    expect(screen.getByText('暂无属性')).toBeInTheDocument();
    expect(screen.getByTestId('key-value-list-root')).toBeInTheDocument();
  });

  it('title / bordered / column 透传到 Descriptions', () => {
    const { container } = render(
      <KeyValueList items={items} title="角色详情" bordered column={2} />,
    );

    expect(screen.getByText('角色详情')).toBeInTheDocument();
    expect(container.querySelector('.ant-descriptions-bordered')).not.toBeNull();
  });

  it('column 支持断点映射：窄屏单列（每条一行）、宽屏多列（并成一行）', () => {
    // antd `Descriptions` 的响应式列数是**用 useBreakpoint 解析成数字**的（不是 CSS class），
    // 所以只能从渲染出的行数反推：3 条 × 1 列 = 3 行；3 条 × 3 列 = 1 行。
    const three = [
      { key: 'a', label: '甲', value: 1 },
      { key: 'b', label: '乙', value: 2 },
      { key: 'c', label: '丙', value: 3 },
    ];
    const rowsOf = (container: HTMLElement): number =>
      container.querySelectorAll('.ant-descriptions-view tbody tr').length;

    setViewportWidth(393);
    const narrow = render(<KeyValueList items={three} column={{ xs: 1, md: 3 }} />);
    expect(rowsOf(narrow.container)).toBe(3);
    narrow.unmount();

    setViewportWidth(1280);
    const wide = render(<KeyValueList items={three} column={{ xs: 1, md: 3 }} />);
    expect(rowsOf(wide.container)).toBe(1);
  });

  it('layout=vertical 可渲染，值为富节点', () => {
    render(<KeyValueList items={items} layout="vertical" />);

    expect(screen.getByText('闭关')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
  });

  it('span 逐项透传（跨列项与普通项共存）', () => {
    const { container } = render(
      <KeyValueList
        items={[
          { key: 'a', label: '甲', value: '1' },
          { key: 'b', label: '乙', value: '2', span: 2 },
        ]}
        column={3}
        bordered
      />,
    );

    // antd v6 bordered 模式下 span 作用于内容单元格（label 固定占 1 列）
    expect(container.querySelectorAll('td[colspan="3"]')).toHaveLength(1);
    expect(screen.getByText('乙')).toBeInTheDocument();
  });
});
