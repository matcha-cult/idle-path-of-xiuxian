/**
 * DataTable —— 受控数据表格（列定义与行操作全部插槽化）。
 *
 * 用途：列表 / 背包 / 日志等需要分页、空态与行级操作的场景。
 * 插槽：
 * - `columns` 列定义由容器注入，本组件不感知任何字段语义；
 * - `rowActions` 非空时在列末尾追加一列「操作」；
 * - `emptyText` 覆盖空态文案（内部统一渲染 antd `Empty`）；
 * - `onRowClick` 提供整行点击。
 *
 * 边界：
 * - `dataSource` 为只读数组，内部复制为可变副本后再交给 antd，绝不修改入参；
 * - 不修改传入的 `columns`，追加「操作」列时构造新数组；
 * - `pagination` 缺省或 `false` 时**不分页**（分页总数字段缺失时无法安全推断）；
 * - `pagination.total = 0` 等极端值交由 antd 分页自行降级，不会抛错。
 */
import { Empty, Space, Table } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { ReactNode } from 'react';

/** 受控分页配置：页码/页大小/总数由容器持有，变更经 `onChange` 回传。 */
export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
}

export interface DataTableProps<T> {
  /** antd 列定义（不修改，原样透传）。 */
  columns: ColumnsType<T>;
  /** 行数据（只读，内部复制）。 */
  dataSource: readonly T[];
  /** 行键：字段名或取值函数。 */
  rowKey: (keyof T & string) | ((record: T) => string);
  /** 加载态（透传 antd `loading`）。 */
  loading?: boolean;
  /** 空数据文案（缺省用 antd 默认「暂无数据」）。 */
  emptyText?: ReactNode;
  /** 分页配置；`false` 或缺省表示不分页。 */
  pagination?: false | DataTablePagination;
  /** 行操作插槽；非空时追加一列「操作」。 */
  rowActions?: (record: T) => ReactNode;
  /** 整行点击回调。 */
  onRowClick?: (record: T) => void;
  /** 横向滚动宽度（超出容器时启用）。 */
  scrollX?: number;
  /** 表格标题。 */
  title?: ReactNode;
}

/** 追加操作列的固定 key，避免与业务列冲突。 */
const ACTION_COLUMN_KEY = '__actions';

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    dataSource,
    rowKey,
    loading,
    emptyText,
    pagination,
    rowActions,
    onRowClick,
    scrollX,
    title,
  } = props;

  const mergedColumns: ColumnsType<T> = rowActions
    ? [
        ...columns,
        {
          title: '操作',
          key: ACTION_COLUMN_KEY,
          render: (_value, record) => <Space>{rowActions(record)}</Space>,
        },
      ]
    : [...columns];

  const paginationConfig: false | TablePaginationConfig = pagination
    ? {
        current: pagination.page,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: false,
        onChange: pagination.onChange,
      }
    : false;

  return (
    <Table<T>
      data-testid="data-table-root"
      title={title !== undefined ? () => title : undefined}
      columns={mergedColumns}
      dataSource={[...dataSource]}
      rowKey={rowKey}
      loading={loading}
      locale={{ emptyText: <Empty description={emptyText} /> }}
      pagination={paginationConfig}
      onRow={onRowClick ? (record) => ({ onClick: () => onRowClick(record) }) : undefined}
      scroll={scrollX !== undefined ? { x: scrollX } : undefined}
    />
  );
}
