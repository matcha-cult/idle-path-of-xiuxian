/**
 * ResourceGrid —— 卡片网格布局（栅格化的资源/建筑/条目陈列）。
 *
 * 用途：把只读集合铺成响应式卡片网格，卡片内容完全由 `renderItem` 决定。
 * 插槽：`renderItem` 渲染单元；`keyOf` 提供稳定 key（缺省退化为下标）。
 *
 * 边界：
 * - `loading` 时渲染与 `items` 等长的骨架卡片（空集合时给 4 个占位）；
 * - `items` 为空且非 loading 时渲染整行 `Empty`；
 * - `columns` 提供时优先按断点分配栅格，否则用 `span`（缺省 6）。
 */
import { Card, Col, Empty, Row, Skeleton } from 'antd';
import type { ReactNode } from 'react';

export interface ResourceGridProps<T> {
  /** 数据集合（只读）。 */
  items: readonly T[];
  /** 单元渲染插槽。 */
  renderItem: (item: T, index: number) => ReactNode;
  /** 稳定 key；缺省用下标。 */
  keyOf?: (item: T, index: number) => string;
  /** 单列占宽（24 栅格，缺省 6）。 */
  span?: number;
  /** 加载态：渲染骨架卡片。 */
  loading?: boolean;
  /** 空态文案。 */
  emptyText?: ReactNode;
  /** 响应式断点占宽（提供时覆盖 `span`）。 */
  columns?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
}

/** 空集合 + loading 时的骨架占位数量，避免网格塌陷。 */
const SKELETON_FALLBACK_COUNT = 4;

export function ResourceGrid<T>(props: ResourceGridProps<T>) {
  const {
    items,
    renderItem,
    keyOf,
    span = 6,
    loading,
    emptyText,
    columns,
  } = props;

  const responsive = columns
    ? { xs: columns.xs, sm: columns.sm, md: columns.md, lg: columns.lg, xl: columns.xl }
    : {};
  const colSpan = columns ? undefined : span;

  if (loading) {
    const count = items.length > 0 ? items.length : SKELETON_FALLBACK_COUNT;
    return (
      <Row data-testid="resource-grid-root" gutter={[16, 16]}>
        {Array.from({ length: count }, (_value, index) => (
          <Col key={index} span={colSpan} {...responsive}>
            <Card>
              <Skeleton active title paragraph={{ rows: 2 }} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (items.length === 0) {
    return (
      <Row data-testid="resource-grid-root" gutter={[16, 16]}>
        <Col span={24}>
          <Empty description={emptyText} />
        </Col>
      </Row>
    );
  }

  return (
    <Row data-testid="resource-grid-root" gutter={[16, 16]}>
      {items.map((item, index) => (
        <Col key={keyOf ? keyOf(item, index) : String(index)} span={colSpan} {...responsive}>
          {renderItem(item, index)}
        </Col>
      ))}
    </Row>
  );
}
