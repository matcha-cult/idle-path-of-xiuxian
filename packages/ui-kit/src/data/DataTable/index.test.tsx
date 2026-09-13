/**
 * DataTable：受控表格。
 * 覆盖：正常渲染（表头/行/可访问角色）、空数据、不分页与 total=0、
 * 操作列有无、翻页回调、行点击、按钮交互。
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './index.js';

interface Row {
  id: string;
  name: string;
  level: number;
}

const rows: Row[] = [
  { id: 'a', name: '青云', level: 3 },
  { id: 'b', name: '玄水', level: 7 },
];

const columns: ColumnsType<Row> = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '境界', dataIndex: 'level', key: 'level' },
];

describe('DataTable', () => {
  it('正常渲染：表头、数据行与可访问角色齐全', () => {
    render(<DataTable<Row> columns={columns} dataSource={rows} rowKey="id" />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('青云')).toBeInTheDocument();
    expect(screen.getByText('玄水')).toBeInTheDocument();
    // 表头行 + 2 数据行
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId('data-table-root')).toBeInTheDocument();
  });

  it('空数据：渲染 emptyText 文案', () => {
    render(
      <DataTable<Row>
        columns={columns}
        dataSource={[]}
        rowKey="id"
        emptyText="暂无修士"
      />,
    );

    expect(screen.getByText('暂无修士')).toBeInTheDocument();
    expect(screen.queryByText('青云')).not.toBeInTheDocument();
  });

  it('边界：pagination=false 不渲染分页；total=0 的分页不抛错', () => {
    const { container, unmount } = render(
      <DataTable<Row> columns={columns} dataSource={rows} rowKey="id" pagination={false} />,
    );
    expect(container.querySelector('.ant-pagination')).toBeNull();
    unmount();

    render(
      <DataTable<Row>
        columns={columns}
        dataSource={[]}
        rowKey="id"
        emptyText="空"
        pagination={{ page: 1, pageSize: 10, total: 0, onChange: vi.fn() }}
      />,
    );
    expect(screen.getByText('空')).toBeInTheDocument();
  });

  it('边界：未传 rowActions 时不渲染「操作」列', () => {
    render(<DataTable<Row> columns={columns} dataSource={rows} rowKey="id" />);
    expect(screen.queryByText('操作')).not.toBeInTheDocument();
  });

  it('交互：rowActions 追加「操作」列且按钮可点击', async () => {
    const onUse = vi.fn();
    render(
      <DataTable<Row>
        columns={columns}
        dataSource={rows}
        rowKey="id"
        rowActions={(record) => (
          <Button type="link" onClick={() => onUse(record.id)}>
            {'使用' + record.name}
          </Button>
        )}
      />,
    );

    expect(screen.getByText('操作')).toBeInTheDocument();
    // 传入的 columns 数组不得被就地修改
    expect(columns).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: '使用青云' }));
    expect(onUse).toHaveBeenCalledWith('a');
  });

  it('交互：翻页触发 onChange(page, pageSize)', () => {
    const onChange = vi.fn();
    render(
      <DataTable<Row>
        columns={columns}
        dataSource={rows}
        rowKey="id"
        pagination={{ page: 1, pageSize: 10, total: 25, onChange }}
      />,
    );

    fireEvent.click(screen.getByTitle('2'));
    expect(onChange).toHaveBeenCalledWith(2, 10);
  });

  it('交互：行点击触发 onRowClick', async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable<Row>
        columns={columns}
        dataSource={rows}
        rowKey="id"
        onRowClick={onRowClick}
      />,
    );

    await userEvent.click(screen.getByText('玄水'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });
});
