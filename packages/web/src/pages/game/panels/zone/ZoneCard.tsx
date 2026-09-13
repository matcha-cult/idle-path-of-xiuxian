/**
 * ZoneCard —— 单个秘境卡（从 ZonePanel 拆出，保持单文件规模与单一职责）。
 *
 * 只展示「玩家选秘境需要的判断信息」：名称/章节/是否当前/进度/能否进入。
 * 协议字段不上屏：`code` 只做 key 与 testid，`unitCode/bossCode/orderIndex` 不展示。
 */
import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { ConfirmAction, LockedHint } from '@idle-path/ui-kit';
import type { ZoneView } from '@idle-path/ionet-transport';
import { prevZoneHint, zoneFloorText } from './presentation.js';

export interface ZoneCardProps {
  zone: ZoneView;
  /** 当前角色境界（用于「境界不足」对比；未知时传 undefined）。 */
  realm: number | undefined;
  /** 是否是该秘境为当前所在。 */
  current: boolean;
  onEnter: (code: string) => void;
}

export function ZoneCard(props: ZoneCardProps) {
  const { zone, realm, current, onEnter } = props;

  return (
    <Card
      data-testid={`zone-card-${zone.code}`}
      variant="outlined"
      title={
        <Space wrap>
          <span>{zone.name}</span>
          <Tag>第 {zone.chapter} 章</Tag>
          {current ? <Tag color="processing">当前</Tag> : null}
        </Space>
      }
    >
      <Flex vertical gap={8}>
        <Typography.Text type="secondary">{zoneFloorText(zone.progress?.bestFloor, zone.maxFloor)}</Typography.Text>

        {zone.unlocked ? (
          current ? (
            <Typography.Text type="secondary">已在此秘境</Typography.Text>
          ) : (
            <ConfirmAction title={`进入「${zone.name}」？`} onConfirm={() => onEnter(zone.code)}>
              <Button data-testid={`zone-enter-${zone.code}`}>进入</Button>
            </ConfirmAction>
          )
        ) : (
          <div data-testid={`zone-locked-${zone.code}`}>
            {zone.unlockedReason === 'realm' ? (
              <LockedHint title={`${zone.name} 尚未解锁`} reason="realm" required={zone.minRealm} current={realm} />
            ) : (
              <LockedHint
                title={`${zone.name} 尚未解锁`}
                reason="prev"
                hint={prevZoneHint(zone.prevZone, zone.requirePrevBestFloor, zone.prevBestFloor)}
              />
            )}
          </div>
        )}
      </Flex>
    </Card>
  );
}
