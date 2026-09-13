/**
 * PagedGrid —— 分页卡片网格。
 *
 * 用途：服务端分页的卡牌 / 建筑 / 掉落陈列：网格与三态（加载 / 空 / 正常）复用同包 `ResourceGrid`，
 * 本组件只在其下补一条 antd `Pagination`（右对齐、不提供每页条数切换器）。
 * 受控约定：`page` / `pageSize` / `total` 全部由调用方持有，本组件**不切片、不改页**。
 *
 * 边界：
 * - `total` 非有限或 `<= 0`：不渲染分页条（分页条自身也会因 `hideOnSinglePage` 隐藏）；
 * - `pageSize` 非有限或 `<= 0`：不渲染分页条，避免 antd 内部按 0 计算总页数（`(total-1)/pageSize`）；
 * - `page` 非有限或 `< 1`：展示值兜底为 1；`page` 超过总页数时**不**自行纠正、不触发 `onPageChange`，
 *   由调用方拉取数据后回填正确的 `page`（受控语义）。
 */
import { Flex, Pagination } from 'antd';
import type { ReactNode } from 'react';
import { ResourceGrid } from '../ResourceGrid/index.js';

export interface PagedGridProps<T> {
  /** 当前页的数据集合（只读）。 */
  items: readonly T[];
  /** 单元渲染插槽。 */
  renderItem: (item: T, index: number) => ReactNode;
  /** 稳定 key；缺省由 `ResourceGrid` 退化为下标。 */
  keyOf?: (item: T, index: number) => string;
  /** 每张卡的栅格宽度（24 栅格制），缺省 8。 */
  span?: number;
  /** 加载态（交给 `ResourceGrid` 渲染骨架卡片）。 */
  loading?: boolean;
  /** 空态文案。 */
  emptyText?: ReactNode;
  /** 当前页，从 1 起（受控）。 */
  page: number;
  /** 每页条数（受控）。 */
  pageSize: number;
  /** 总条数（受控，通常是服务端总数）。 */
  total: number;
  /** 切页回调（页码 + 每页条数）。 */
  onPageChange: (page: number, pageSize: number) => void;
}

export function PagedGrid<T>(props: PagedGridProps<T>) {
  const {
    items,
    renderItem,
    keyOf,
    span = 8,
    loading,
    emptyText,
    page,
    pageSize,
    total,
    onPageChange,
  } = props;

  const paginatable =
    Number.isFinite(total) && total > 0 && Number.isFinite(pageSize) && pageSize > 0;
  const safePage = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;

  return (
    <Flex vertical gap={16} data-testid="paged-grid-root">
      <ResourceGrid<T>
        items={items}
        renderItem={renderItem}
        keyOf={keyOf}
        span={span}
        loading={loading}
        emptyText={emptyText}
      />
      {paginatable ? (
        <Pagination
          data-testid="paged-grid-pagination"
          align="end"
          current={safePage}
          pageSize={pageSize}
          total={total}
          showSizeChanger={false}
          hideOnSinglePage
          onChange={onPageChange}
        />
      ) : null}
    </Flex>
  );
}
