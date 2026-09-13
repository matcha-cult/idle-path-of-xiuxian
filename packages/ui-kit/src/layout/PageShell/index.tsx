/**
 * PageShell —— 页面级布局壳：页头（标题/副标题/右侧操作）+ 工具条 + 内容区。
 *
 * 插槽：`title`（必需）/ `subtitle` / `extra`（页头右侧按钮）/ `toolbar`（页头与内容之间的操作条）/ `children`。
 * 布局：最外层 antd `Flex vertical` 提供统一段间距；页头为 `Flex justify="space-between"`
 * 且 `wrap`，窄屏时右侧操作自动换到下一行而不是挤压标题。
 *
 * 边界：`subtitle`/`extra`/`toolbar` 未提供（含空串、`null`、`false`）时不渲染对应区域，
 * 不产生空占位；`children` 为 `''` 时内容区无节点，壳本身仍完整可用。
 */
import { Flex, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Toolbar } from '../Toolbar/index.js';

export interface PageShellProps {
  /** 页面标题（必需）。 */
  title: ReactNode;
  /** 标题下方的次要说明。 */
  subtitle?: ReactNode;
  /** 页头右侧区域（按钮等）。 */
  extra?: ReactNode;
  /** 页头与内容之间的工具条区域。 */
  toolbar?: ReactNode;
  /** 页面主内容。 */
  children: ReactNode;
}

/** 统一「插槽是否有内容」判定：空串与 null/undefined/false 都算未提供。 */
function hasSlot(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== '';
}

export function PageShell(props: PageShellProps) {
  const { title, subtitle, extra, toolbar, children } = props;
  return (
    <Flex vertical gap="middle" data-testid="page-shell-root">
      <Flex justify="space-between" align="flex-start" wrap gap="middle" data-testid="page-shell-header">
        <Flex vertical gap={2} data-testid="page-shell-heading">
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {hasSlot(subtitle) ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
        </Flex>
        {hasSlot(extra) ? (
          <Space wrap data-testid="page-shell-extra">
            {extra}
          </Space>
        ) : null}
      </Flex>
      {hasSlot(toolbar) ? <Toolbar left={toolbar} /> : null}
      {children}
    </Flex>
  );
}
