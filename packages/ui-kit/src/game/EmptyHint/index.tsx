/**
 * EmptyHint —— 统一空态 + 引导动作插槽，游戏语义通用组。
 *
 * 用途：背包 / 商店 / 日志 / 列表等一切「无数据」场景，避免各页面各写一套空态。
 * 约定：文案与动作全部由 props 注入，组件不含任何业务/游戏文案与数值。
 *
 * 插槽：`action`（放在 antd `Empty` 的 footer 区）。
 * 边界：`description` 缺省「暂无数据」；`action` 缺省不渲染 footer；`compact` 切 SIMPLE 图。
 */
import { Empty } from 'antd';
import type { ReactNode } from 'react';

export interface EmptyHintProps {
  /** 空态描述，缺省「暂无数据」。 */
  description?: ReactNode;
  /** 引导动作插槽（如「去矿脉」按钮），缺省不渲染。 */
  action?: ReactNode;
  /** `true` 时使用 antd `Empty.PRESENTED_IMAGE_SIMPLE` 小图。 */
  compact?: boolean;
}

export function EmptyHint(props: EmptyHintProps) {
  const { description, action, compact } = props;
  return (
    <Empty
      data-testid="empty-hint-root"
      image={compact ? Empty.PRESENTED_IMAGE_SIMPLE : undefined}
      description={description ?? '暂无数据'}
    >
      {action}
    </Empty>
  );
}
