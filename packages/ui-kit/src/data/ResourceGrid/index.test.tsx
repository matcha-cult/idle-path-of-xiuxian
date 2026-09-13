/**
 * ResourceGrid：卡片网格。
 * 覆盖：正常渲染（含下标缺省 key）、空态、loading 骨架、
 * span / 响应式 columns、renderItem 收到 index。
 */
import { render, screen } from '@testing-library/react';
import { Card } from 'antd';
import { describe, expect, it } from 'vitest';
import { ResourceGrid } from './index.js';

interface Item {
  id: string;
  name: string;
}

const items: Item[] = [
  { id: 'a', name: '灵草' },
  { id: 'b', name: '玄铁' },
];

describe('ResourceGrid', () => {
  it('正常渲染：每个条目调用 renderItem 并展示', () => {
    render(
      <ResourceGrid<Item>
        items={items}
        keyOf={(item) => item.id}
        renderItem={(item) => <Card title={item.name}>{item.id}</Card>}
      />,
    );

    expect(screen.getByTestId('resource-grid-root')).toBeInTheDocument();
    expect(screen.getByText('灵草')).toBeInTheDocument();
    expect(screen.getByText('玄铁')).toBeInTheDocument();
  });

  it('边界：无 keyOf 时用下标作 key，不抛错', () => {
    render(
      <ResourceGrid<Item>
        items={items}
        renderItem={(item) => <Card>{item.name}</Card>}
      />,
    );

    expect(screen.getByText('灵草')).toBeInTheDocument();
    expect(screen.getByText('玄铁')).toBeInTheDocument();
  });

  it('renderItem 收到正确的 index，span 透传到栅格列', () => {
    const { container } = render(
      <ResourceGrid<Item>
        items={items}
        span={12}
        renderItem={(item, index) => <Card>{`${index}-${item.name}`}</Card>}
      />,
    );

    expect(screen.getByText('0-灵草')).toBeInTheDocument();
    expect(screen.getByText('1-玄铁')).toBeInTheDocument();
    expect(container.querySelectorAll('.ant-col-12')).toHaveLength(2);
  });

  it('空数据：渲染 emptyText', () => {
    render(
      <ResourceGrid<Item>
        items={[]}
        emptyText="背包空空如也"
        renderItem={(item) => <Card>{item.name}</Card>}
      />,
    );

    expect(screen.getByText('背包空空如也')).toBeInTheDocument();
    expect(screen.getByTestId('resource-grid-root')).toBeInTheDocument();
  });

  it('loading：渲染骨架卡片且不渲染条目', () => {
    const { container } = render(
      <ResourceGrid<Item>
        items={items}
        loading
        renderItem={(item) => <Card>{item.name}</Card>}
      />,
    );

    expect(container.querySelectorAll('.ant-skeleton')).toHaveLength(2);
    expect(screen.queryByText('灵草')).not.toBeInTheDocument();
  });

  it('响应式 columns：提供断点时覆盖 span', () => {
    const { container } = render(
      <ResourceGrid<Item>
        items={items}
        columns={{ xs: 24, md: 8 }}
        renderItem={(item) => <Card>{item.name}</Card>}
      />,
    );

    expect(container.querySelectorAll('.ant-col-xs-24')).toHaveLength(2);
    expect(container.querySelectorAll('.ant-col-md-8')).toHaveLength(2);
  });
});
