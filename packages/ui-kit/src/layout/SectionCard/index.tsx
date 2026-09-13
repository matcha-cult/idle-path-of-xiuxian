/**
 * SectionCard —— 内容分区卡片：标题/副标题 + 右侧操作 + 加载态（纯展示，受控）。
 *
 * 插槽：`title`（缺省则不渲染卡片头）/ `subtitle` / `extra`（卡片头右侧按钮）/ `children`。
 * 加载态：`loading` 为真时**只替换内容区**（渲染 `Skeleton active`），卡片头保留，
 * 这样标题与操作在加载期间不闪烁、布局不塌陷。
 *
 * 边界：`title`/`subtitle` 同时缺省时 `Card` 不产生头部（无空白头部占位）；
 * 超长标题由 antd `Card` 头部自行省略，不影响 `extra` 可见；
 * `loading` 期间传入的 `children` 不渲染（业务侧无需自行判断）。
 */
import { Card, Flex, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';

export interface SectionCardProps {
  /** 卡片标题（缺省则不渲染卡片头）。 */
  title?: ReactNode;
  /** 标题下方的次要说明。 */
  subtitle?: ReactNode;
  /** 卡片头右侧区域（按钮等）。 */
  extra?: ReactNode;
  /** 加载态：为真时内容区渲染骨架屏。 */
  loading?: boolean;
  /** 卡片内容。 */
  children: ReactNode;
}

export function SectionCard(props: SectionCardProps) {
  const { title, subtitle, extra, loading = false, children } = props;
  const hasTitle = title !== undefined && title !== null;
  const hasSubtitle = subtitle !== undefined && subtitle !== null;
  const heading =
    hasTitle || hasSubtitle ? (
      <Flex vertical gap={2} data-testid="section-card-heading">
        {hasTitle ? (
          <Typography.Title level={5} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
        ) : null}
        {hasSubtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </Flex>
    ) : undefined;

  return (
    <Card title={heading} extra={extra} data-testid="section-card-root">
      {loading ? (
        <Flex vertical data-testid="section-card-loading">
          <Skeleton active />
        </Flex>
      ) : (
        children
      )}
    </Card>
  );
}
