/**
 * PanelPlaceholder —— 「该域面板待重做」占位。
 *
 * 用途：外壳（导航 / HUD / 主题 / 连接）先落地时，内容区用统一样式声明该域尚未按新形态实现，
 * 避免空内容区与「半成品面板」混杂。纯展示，无业务语义。
 */
import { Flex, Result, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';

export interface PanelPlaceholderProps {
  /** 域名称（如「秘境」）。 */
  title: ReactNode;
  /** 一句话说明该面板重做后会给玩家看什么。 */
  description?: ReactNode;
  /** 状态：`pending`（正在重做）/ `planned`（排队中）。 */
  status?: 'pending' | 'planned';
  /** 将要呈现的要点（纯文案，不含业务数值）。 */
  highlights?: readonly string[];
  icon?: ReactNode;
}

const STATUS_TEXT: Record<'pending' | 'planned', string> = {
  pending: '重做中',
  planned: '排队中',
};

export function PanelPlaceholder(props: PanelPlaceholderProps) {
  const { title, description, status = 'pending', highlights, icon } = props;

  return (
    <Flex vertical align="center" data-testid="panel-placeholder-root">
      <Result
        icon={icon}
        title={
          <Space align="center">
            <span>{title}</span>
            <Tag color={status === 'pending' ? 'processing' : 'default'} data-testid="panel-placeholder-status">
              {STATUS_TEXT[status]}
            </Tag>
          </Space>
        }
        subTitle={description}
      />
      {highlights !== undefined && highlights.length > 0 ? (
        <Space wrap data-testid="panel-placeholder-highlights">
          {highlights.map((text) => (
            <Tag key={text}>{text}</Tag>
          ))}
        </Space>
      ) : (
        <Typography.Text type="secondary">该域面板将按新形态（信息卡 + 行动区 + 结算成果）重做</Typography.Text>
      )}
    </Flex>
  );
}
