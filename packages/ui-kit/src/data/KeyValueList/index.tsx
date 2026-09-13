/**
 * KeyValueList —— 键值明细展示（替代手写 `<dl>` / 自定义详情布局）。
 *
 * 用途：角色属性、物品详情、结算明细等「标签 : 值」型只读信息。
 * 插槽：`items` 的 `label` / `value` 均为 `ReactNode`，可放文本、图标或按钮。
 *
 * 边界：
 * - `items` 为空时渲染 `Empty`（`emptyText` 可覆盖文案），根节点仍带 `data-testid`；
 * - `span` 逐项透传给 antd `Descriptions`，用于跨列；`column` 缺省 1；
 * - `column` 支持 antd 原生的断点映射（`{ xs: 1, md: 3 }`）：窄屏上多列「标签 : 值」会被挤到
 *   一行里互相压字，PC 上又白白浪费横向空间，所以列数**应该**按断点给。
 */
import { Descriptions, Empty, Flex } from 'antd';
import type { ReactNode } from 'react';

/** 响应式断点（与 antd `Descriptions` 的断点键一致）。 */
export type KeyValueListBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export interface KeyValueEntry {
  /** 稳定 key。 */
  key: string;
  /** 标签（左列）。 */
  label: ReactNode;
  /** 值（右列）。 */
  value: ReactNode;
  /** 跨列数（透传 antd `Descriptions.Item`）。 */
  span?: number;
}

export interface KeyValueListProps {
  /** 键值条目（只读）。 */
  items: readonly KeyValueEntry[];
  /** 每行列数：数字 = 固定；对象 = 按断点响应式（透传 antd `Descriptions`）。缺省 1。 */
  column?: number | Partial<Record<KeyValueListBreakpoint, number>>;
  /** 是否带边框。 */
  bordered?: boolean;
  /** 标题。 */
  title?: ReactNode;
  /** 布局方向，缺省 horizontal。 */
  layout?: 'horizontal' | 'vertical';
  /** 空态文案。 */
  emptyText?: ReactNode;
}

export function KeyValueList(props: KeyValueListProps) {
  const {
    items,
    column = 1,
    bordered,
    title,
    layout = 'horizontal',
    emptyText,
  } = props;

  if (items.length === 0) {
    return (
      <Flex data-testid="key-value-list-root" vertical>
        <Empty description={emptyText} />
      </Flex>
    );
  }

  return (
    <Descriptions
      data-testid="key-value-list-root"
      title={title}
      bordered={bordered}
      column={column}
      layout={layout}
      items={items.map((item) => ({
        key: item.key,
        label: item.label,
        children: item.value,
        span: item.span,
      }))}
    />
  );
}
