/**
 * PanelPlaceholder —— 「该域面板待重做」占位。
 *
 * 实现要点：用 `Empty`（`PRESENTED_IMAGE_SIMPLE`）而非 `Result`：
 * 原型用 `Result` 的默认 info 图标渲染成一个大号蓝色 `(!)`，看起来像报错，
 * 且占位块过小、四周大片留白。`Empty` 语义中性、体量紧凑，配「要点标签」后信息密度合适。
 *
 * 纯展示，无业务语义。
 */
import { Empty, Flex, Space, Tag, Typography, theme } from 'antd';
import type { ReactNode } from 'react';

export interface PanelPlaceholderProps {
  /** 域名称（如「秘境」）。 */
  title: ReactNode;
  /** 一句话说明该面板重做后会给玩家看什么。 */
  description?: ReactNode;
  /** 状态：`pending`（正在重做）/ `planned`（排队中）。 */
  status?: 'pending' | 'planned';
  /** 将要呈现的要点（来自玩法规格的纯文案，不含业务数值）。 */
  highlights?: readonly string[];
  icon?: ReactNode;
}

const STATUS_TEXT: Record<'pending' | 'planned', string> = {
  pending: '重做中',
  planned: '排队中',
};

export function PanelPlaceholder(props: PanelPlaceholderProps) {
  const { title, description, status = 'pending', highlights, icon } = props;
  const { token } = theme.useToken();

  return (
    <Flex
      vertical
      align="center"
      justify="center"
      gap={token.paddingSM}
      style={{ minHeight: 240, padding: token.paddingLG }}
      data-testid="panel-placeholder-root"
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Flex vertical align="center" gap={2}>
            <Space align="center" size={token.paddingXS}>
              {icon}
              <Typography.Text strong>{title}</Typography.Text>
              <Tag color={status === 'pending' ? 'processing' : 'default'} data-testid="panel-placeholder-status">
                {STATUS_TEXT[status]}
              </Tag>
            </Space>
            <Typography.Text type="secondary">{description ?? '该面板将按实际玩法重做'}</Typography.Text>
          </Flex>
        }
      />
      {highlights !== undefined && highlights.length > 0 ? (
        <Flex vertical align="center" gap={token.paddingXS}>
          <Typography.Text type="secondary">重做后将呈现</Typography.Text>
          <Space wrap data-testid="panel-placeholder-highlights">
            {highlights.map((text) => (
              <Tag key={text}>{text}</Tag>
            ))}
          </Space>
        </Flex>
      ) : (
        <Typography.Text type="secondary">信息卡 + 行动区 + 结算成果</Typography.Text>
      )}
    </Flex>
  );
}
