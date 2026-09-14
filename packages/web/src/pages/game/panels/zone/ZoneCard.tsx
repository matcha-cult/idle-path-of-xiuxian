/**
 * ZoneCard —— 单个已突破秘境卡（从 ZonePanel 拆出，保持单文件规模与单一职责）。
 *
 * §22：这张卡只出现在**秘境页面**，而秘境页面只列**已突破**的秘境（用户 Q4：
 * 未解锁的不在秘境页面显示），因此卡上不再有「解锁条件 / 境界不足」那套 UI ——
 * 只剩「我在这个秘境打到哪、要不要再打一轮」。
 *
 * 协议字段不上屏：`code` 只做 key 与 testid，`unitCode/bossCode/orderIndex` 不展示。
 */
import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { ConfirmAction } from '@idle-path/ui-kit';
import type { ZoneView } from '@idle-path/ionet-transport';
import { zoneClearsText, zoneFloorText, zoneTierLabel } from './presentation.js';

export interface ZoneCardProps {
  zone: ZoneView;
  /** 是否是当前在线战斗所在的秘境。 */
  current: boolean;
  onEnter: (code: string) => void;
}

export function ZoneCard(props: ZoneCardProps) {
  const { zone, current, onEnter } = props;

  return (
    <Card
      data-testid={`zone-card-${zone.code}`}
      variant="outlined"
      title={
        <Space wrap>
          <span>{zone.name}</span>
          <Tag>第 {zone.realm} 境</Tag>
          <Tag color={zone.tierKind === 'special' ? 'gold' : 'green'}>{zoneTierLabel(zone.tierKind)}</Tag>
          {current ? <Tag color="processing">战斗中</Tag> : null}
        </Space>
      }
    >
      <Flex vertical gap={8}>
        <Typography.Text type="secondary">
          {zoneFloorText(zone.progress?.bestFloor, zone.maxFloor)} · {zoneClearsText(zone.progress?.clears)}
        </Typography.Text>

        {current ? (
          <Typography.Text type="secondary">已在此秘境战斗</Typography.Text>
        ) : (
          <ConfirmAction title={`进入「${zone.name}」再打一轮？`} onConfirm={() => onEnter(zone.code)}>
            <Button data-testid={`zone-enter-${zone.code}`}>重复挑战</Button>
          </ConfirmAction>
        )}
      </Flex>
    </Card>
  );
}