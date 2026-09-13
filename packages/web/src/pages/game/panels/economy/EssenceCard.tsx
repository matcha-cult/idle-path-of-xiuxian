/**
 * EssenceCard —— 精华图鉴单元（从 `EconomyPanel` 拆出，保持单文件规模）。
 *
 * 实现真相（`10-...md` §4-5）：当前是 **6 种单阶精华、无合成**，因此面板不画阶数、不做合成入口。
 * 协议字段不上屏：`code` 只做 key，`polarity` / `targetFamily` 原文不展示（改用中文说明）。
 */
import { Card, Flex, Space, Tag, Typography } from 'antd';
import type { EssenceView } from '@idle-path/ionet-transport';
import { formatCompactNumber } from '../../../../domain/format.js';

export interface EssenceCardProps {
  essence: EssenceView;
}

/** `polarity` 原文 → 中文方位（未知值给中性文案）。 */
function polarityLabel(polarity: string): string {
  if (polarity === 'prefix') return '前缀定向';
  if (polarity === 'suffix') return '后缀定向';
  return '定向';
}

export function EssenceCard({ essence }: EssenceCardProps) {
  return (
    <Card data-testid={`economy-essence-${essence.id}`} variant="outlined">
      <Flex vertical gap={4}>
        <Space wrap align="center">
          <Typography.Text strong>{essence.name}</Typography.Text>
          <Tag>{polarityLabel(essence.polarity)}</Tag>
          <Tag color={essence.owned > 0 ? 'processing' : 'default'}>持有 {formatCompactNumber(essence.owned)}</Tag>
        </Space>
        <Typography.Text type="secondary">{essence.description === '' ? '暂无说明' : essence.description}</Typography.Text>
      </Flex>
    </Card>
  );
}
