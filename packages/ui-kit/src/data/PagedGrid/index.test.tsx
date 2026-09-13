/**
 * PagedGrid：分页卡片网格。
 * 覆盖：正常（网格 + 分页条右对齐 / 无条数切换器）、空数据、page 越界不自纠、
 * pageSize / total 非法值防 0、切页交互、loading 三态与 span 透传、可访问性。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Card } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { PagedGrid } from './index.js';

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: 'a', name: '甲' },
  { id: 'b', name: '乙' },
];

function renderText(item: Row) {
  return <Card>{item.name}</Card>;
}

describe('PagedGrid', () => {
  it('正常：渲染当前页条目并提供分页条（右对齐、不显示条数切换器）', () => {
    const { container } = render(
      <PagedGrid<Row>
        items={rows}
        keyOf={(item) => item.id}
        renderItem={renderText}
        page={2}
        pageSize={10}
        total={30}
        onPageChange={() => {}}
      />,
    );

    expect(screen.getByTestId('resource-grid-root')).toBeInTheDocument();
    expect(screen.getByText('甲')).toBeInTheDocument();
    expect(screen.getByText('乙')).toBeInTheDocument();
    expect(screen.getByTestId('paged-grid-pagination')).toBeInTheDocument();
    // 30 / 10 = 3 页；align="end" 落在分页根节点上。
    expect(screen.getByTitle('3')).toBeInTheDocument();
    expect(container.querySelector('.ant-pagination-end')).not.toBeNull();
    expect(container.querySelector('.ant-pagination-options')).toBeNull();
  });

  it('空数据：total=0 时不渲染分页条，网格走空态', () => {
    render(
      <PagedGrid<Row>
        items={[]}
        renderItem={renderText}
        emptyText="暂无条目"
        page={1}
        pageSize={10}
        total={0}
        onPageChange={() => {}}
      />,
    );

    expect(screen.getByText('暂无条目')).toBeInTheDocument();
    expect(screen.queryByTestId('paged-grid-pagination')).toBeNull();
  });

  it('边界：page 超出总页数时不自行改页、不回调、不崩', () => {
    const onPageChange = vi.fn();
    render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        page={99}
        pageSize={10}
        total={20}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByTestId('paged-grid-pagination')).toBeInTheDocument();
    expect(screen.getByText('甲')).toBeInTheDocument();
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('边界：pageSize 为 0 / 负数 / NaN 与 total 非有限数时不渲染分页条且不崩', () => {
    const { unmount } = render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        page={1}
        pageSize={0}
        total={10}
        onPageChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('paged-grid-pagination')).toBeNull();
    unmount();

    const { unmount: unmountSecond } = render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        page={1}
        pageSize={-5}
        total={10}
        onPageChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('paged-grid-pagination')).toBeNull();
    unmountSecond();

    render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        page={Number.NaN}
        pageSize={Number.NaN}
        total={Number.POSITIVE_INFINITY}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText('甲')).toBeInTheDocument();
    expect(screen.queryByTestId('paged-grid-pagination')).toBeNull();
  });

  it('边界：page 为 NaN 时兜底为第 1 页并正常给出分页条', () => {
    render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        page={Number.NaN}
        pageSize={10}
        total={30}
        onPageChange={() => {}}
      />,
    );

    expect(screen.getByTestId('paged-grid-pagination')).toBeInTheDocument();
    expect(screen.getByTitle('1').className).toContain('ant-pagination-item-active');
  });

  it('交互：点击页码触发 onPageChange(page, pageSize)', () => {
    const onPageChange = vi.fn();
    render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        page={1}
        pageSize={10}
        total={30}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(screen.getByTitle('2'));
    expect(onPageChange).toHaveBeenCalledWith(2, 10);
  });

  it('三态与栅格：loading 渲染骨架、span 透传到栅格列、无分页条时仍不崩', () => {
    const { container } = render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        span={12}
        loading
        page={1}
        pageSize={10}
        total={30}
        onPageChange={() => {}}
      />,
    );

    expect(container.querySelectorAll('.ant-skeleton')).toHaveLength(2);
    expect(container.querySelectorAll('.ant-col-12')).toHaveLength(2);
    expect(screen.queryByText('甲')).toBeNull();
  });

  it('可访问性：分页条是无障碍列表，页码可聚焦且带标题', () => {
    render(
      <PagedGrid<Row>
        items={rows}
        renderItem={renderText}
        page={1}
        pageSize={10}
        total={30}
        onPageChange={() => {}}
      />,
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.getByTitle('2')).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('list')).toHaveAttribute('data-testid', 'paged-grid-pagination');
  });
});
