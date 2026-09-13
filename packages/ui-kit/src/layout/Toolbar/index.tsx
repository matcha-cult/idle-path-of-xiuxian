/**
 * Toolbar —— 列表/面板通用的操作条（纯展示，受控）。
 *
 * 插槽：`left`（筛选、刷新等次要操作）/ `right`（主按钮）/ `children`（中间自定义区）。
 * 布局：antd `Flex` + `wrap` + `gap`，左右两侧各包一层 `Space`，窄屏自动换行，
 * 避免按钮互相挤压。
 *
 * 边界：空串 `''` 与 `null`/`undefined`/`false` 一律视为「未提供」，对应插槽不渲染。
 * 注意 antd `Space` 在无子节点时会渲染为 `null`（不会留下占位节点），因此**不能**
 * 依赖空 `Space` 当撑杆：只给 `right` 时若仍然 `justify="space-between"`，
 * 单个 flex 子项会被挤到最左侧。故此处按实际插槽计算对齐方式——
 * 左右都有内容用 `space-between`，只有 `right` 用 `flex-end`，只有 `left` 用 `flex-start`。
 * 无任何插槽时仍渲染空的操作条（`toolbar-root` 存在但无内容），
 * 保证父级栅格/`gap` 计算不因「有时渲染有时不渲染」而跳动。
 */
import { Flex, Space } from 'antd';
import type { ReactNode } from 'react';

export interface ToolbarProps {
  /** 左侧操作（筛选/刷新等）。 */
  left?: ReactNode;
  /** 右侧操作（主按钮）。 */
  right?: ReactNode;
  /** 可选：中间自定义区。 */
  children?: ReactNode;
}

/** 统一「插槽是否有内容」判定：空串与 null/undefined/false 都算未提供。 */
function hasSlot(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== '';
}

export function Toolbar(props: ToolbarProps) {
  const { left, right, children } = props;
  const hasLeft = hasSlot(left);
  const hasRight = hasSlot(right);
  const justify = hasLeft && hasRight ? 'space-between' : hasRight ? 'flex-end' : 'flex-start';

  return (
    <Flex justify={justify} align="center" wrap gap="small" data-testid="toolbar-root">
      {hasLeft ? (
        <Space wrap data-testid="toolbar-left">
          {left}
        </Space>
      ) : null}
      {hasSlot(children) ? (
        <Space wrap data-testid="toolbar-center">
          {children}
        </Space>
      ) : null}
      {hasRight ? (
        <Space wrap data-testid="toolbar-right">
          {right}
        </Space>
      ) : null}
    </Flex>
  );
}
