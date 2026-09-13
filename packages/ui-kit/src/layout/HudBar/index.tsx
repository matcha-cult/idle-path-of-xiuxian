/**
 * HudBar —— 常驻信息条（角色 / 境界 / 资源 / 连接状态）。
 *
 * 纯展示：条目由 `items` 注入（`label` + `value` 全为 ReactNode），组件不知道任何游戏概念，
 * 因此登录页、后台页也能复用。颜色只用 antd token / 语义 prop。
 *
 * 边界：`items=[]` 时左侧不渲染任何条目（右侧 `extra` 仍在）；`loading` 时每个条目显示骨架。
 */
import { Divider, Flex, Skeleton, Space, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';

export interface HudItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tooltip?: ReactNode;
}

export interface HudBarProps {
  items: readonly HudItem[];
  /** 右侧操作区（连接状态、主题切换等）。 */
  extra?: ReactNode;
  /** 数据未就绪时显示骨架。 */
  loading?: boolean;
  /** 是否允许换行（窄屏建议 true）。 */
  wrap?: boolean;
}

export function HudBar(props: HudBarProps) {
  const { items, extra, loading = false, wrap = true } = props;

  return (
    <Flex justify="space-between" align="center" wrap={wrap} gap="small" data-testid="hud-bar-root">
      <Space separator={<Divider orientation="vertical" />} wrap>
        {items.map((item) => {
          const content = (
            <Space align="center" size={4}>
              {item.icon}
              <Typography.Text type="secondary">{item.label}</Typography.Text>
              {loading ? (
                <Skeleton.Input active style={{ width: 48 }} />
              ) : (
                <Typography.Text strong data-testid={`hud-item-${item.key}`}>
                  {item.value}
                </Typography.Text>
              )}
            </Space>
          );
          return item.tooltip === undefined ? (
            <span key={item.key}>{content}</span>
          ) : (
            <Tooltip key={item.key} title={item.tooltip}>
              <span>{content}</span>
            </Tooltip>
          );
        })}
      </Space>
      {extra}
    </Flex>
  );
}
