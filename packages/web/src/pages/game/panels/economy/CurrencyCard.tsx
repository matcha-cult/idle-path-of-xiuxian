/**
 * CurrencyCard —— 通货图鉴单元（从 `EconomyPanel` 拆出，保持单文件规模）。
 *
 * 只展示玩家决策需要的四件事：名称 / 持有量 / 说明 / 是否可达。
 * 协议字段不上屏：`code` 只做 key 与判定，`id` 只做 testid。
 */
import { Card, Flex, Space, Tag, Typography } from 'antd';
import type { CurrencyView } from '@idle-path/ionet-transport';
import { formatCompactNumber } from '../../../../domain/format.js';
import { hasDropSource } from './presentation.js';

export interface CurrencyCardProps {
  currency: CurrencyView;
}

export function CurrencyCard({ currency }: CurrencyCardProps) {
  return (
    <Card data-testid={`economy-currency-${currency.id}`} variant="outlined">
      <Flex vertical gap={4}>
        <Space wrap align="center">
          <Typography.Text strong>{currency.name}</Typography.Text>
          <Tag>持有 {formatCompactNumber(currency.owned)}</Tag>
          {currency.implemented ? null : <Tag color="warning">未开放</Tag>}
          {hasDropSource(currency.code) ? null : <Tag color="default">无掉落来源</Tag>}
        </Space>
        <Typography.Text type="secondary">{currency.description === '' ? '暂无说明' : currency.description}</Typography.Text>
      </Flex>
    </Card>
  );
}
