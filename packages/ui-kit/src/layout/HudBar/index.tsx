/**
 * HudBar —— 常驻信息条（角色 / 境界 / 资源 / 进度）。
 *
 * 实现取舍（两次返工的结论）：
 * - v1 用 Flex+Space：窄屏与实现细节一起把 HUD 挤爆；
 * - v2 改 `Descriptions`：PC 上五格被拉满整宽、间距过散，移动端表格单元格把取值压成**单字竖排**；
 * - v3（当前）：回到**紧凑聚类**——每项是「次要标签 + 强调取值」，整体 `wrap`，
 *   宽度足够时一行排开、不足时自然换行，任何断点下都不会出现等宽拉伸或逐字换行。
 *
 * 纯展示：条目由 `items` 注入，组件不知道任何游戏概念；颜色只用 token；不传 `size`。
 */
import { Flex, Skeleton, Tooltip, Typography, theme } from 'antd';
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
}

export function HudBar(props: HudBarProps) {
  const { items, extra, loading = false } = props;
  const { token } = theme.useToken();

  return (
    <Flex justify="space-between" align="center" wrap gap={token.paddingSM} data-testid="hud-bar-root">
      <Flex align="center" wrap gap={`${token.paddingXS}px ${token.padding}px`} data-testid="hud-items">
        {items.map((item) => {
          const label =
            item.tooltip === undefined ? (
              <Typography.Text type="secondary">{item.label}</Typography.Text>
            ) : (
              <Tooltip title={item.tooltip}>
                <Typography.Text type="secondary" style={{ borderBottom: `1px dashed ${token.colorBorder}` }}>
                  {item.label}
                </Typography.Text>
              </Tooltip>
            );

          return (
            <Flex key={item.key} align="baseline" gap={token.paddingXS} data-testid={`hud-row-${item.key}`}>
              {item.icon}
              {label}
              {loading ? (
                <Skeleton.Input active style={{ width: 48 }} />
              ) : (
                <Typography.Text strong data-testid={`hud-item-${item.key}`}>
                  {item.value}
                </Typography.Text>
              )}
            </Flex>
          );
        })}
      </Flex>
      {extra}
    </Flex>
  );
}
