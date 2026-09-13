/**
 * HudBar —— 常驻信息条（角色 / 境界 / 资源 / 进度）。
 *
 * 实现要点（依据 `antd info Descriptions` 与官方 `responsive` 示例）：
 * - 用 `Descriptions` 而非手写 Flex：天然带「标签 + 取值」语义与**响应式列数**，
 *   `column={{xs:1,sm:2,md:3,lg:4,xl:6}}` 解决窄屏折行/挤压（原型里 HUD 横向贴边）；
 * - `colon={false}` + token 化内边距，保持单行紧凑；不传 `size`（全局紧凑算法已生效）；
 * - 纯展示：条目由 `items` 注入，组件不知道任何游戏概念。
 *
 * 边界：`items=[]` 时仍渲染右侧 `extra`；`loading` 时每个取值位显示骨架；`tooltip` 包在标签上。
 */
import { Descriptions, Flex, Skeleton, Tooltip, Typography, theme } from 'antd';
import type { DescriptionsProps } from 'antd';
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
  /** 响应式列数；缺省 `{xs:1, sm:2, md:3, lg:4, xl:6}`。 */
  column?: DescriptionsProps['column'];
  /** 是否允许换行（窄屏建议 true）。 */
  wrap?: boolean;
}

const DEFAULT_COLUMN: DescriptionsProps['column'] = { xs: 1, sm: 2, md: 3, lg: 4, xl: 6 };

export function HudBar(props: HudBarProps) {
  const { items, extra, loading = false, column = DEFAULT_COLUMN, wrap = true } = props;
  const { token } = theme.useToken();

  const descriptionItems: DescriptionsProps['items'] = items.map((item) => ({
    key: item.key,
    label:
      item.tooltip === undefined ? (
        item.label
      ) : (
        <Tooltip title={item.tooltip}>
          <span style={{ borderBottom: `1px dashed ${token.colorBorder}` }}>{item.label}</span>
        </Tooltip>
      ),
    children: loading ? (
      <Skeleton.Input active style={{ width: 48 }} />
    ) : (
      <Typography.Text strong data-testid={`hud-item-${item.key}`}>
        {item.icon}
        {item.value}
      </Typography.Text>
    ),
  }));

  return (
    <Flex justify="space-between" align="center" wrap={wrap} gap={token.paddingSM} data-testid="hud-bar-root">
      <Descriptions
        colon={false}
        column={column}
        items={descriptionItems}
        style={{ flex: 1, minWidth: 0 }}
        styles={{ label: { color: token.colorTextSecondary } }}
      />
      {extra}
    </Flex>
  );
}
