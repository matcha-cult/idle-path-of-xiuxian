/**
 * ZoneCard —— 单个已突破秘境卡（从 ZonePanel 拆出，保持单文件规模与单一职责）。
 *
 * §22：这张卡只出现在**秘境页面**，而秘境页面只列**已突破**的秘境（用户 Q4：
 * 未解锁的不在秘境页面显示），因此卡上不再有「解锁条件 / 境界不足」那套 UI ——
 * 只剩「我在这个秘境打到哪、要不要再打一轮」。
 *
 * §23 ①：再加一个「设为挂机点」的快捷入口（G4）。特殊秘境（`idleAllowed=false`）
 * **不可挂机** —— 按钮禁用并给 Tooltip 说明，前端不提供必败入口（G5）；
 * 已经是挂机点的秘境用 Tag 标出，不再显示重复的设置按钮。
 *
 * 协议字段不上屏：`code` 只做 key 与 testid，`unitCode/bossCode/orderIndex` 不展示。
 */
import { Button, Card, Flex, Space, Tag, Tooltip, Typography } from 'antd';
import { ConfirmAction } from '@idle-path/ui-kit';
import type { ZoneView } from '@idle-path/ionet-transport';
import { zoneClearsText, zoneFloorText, zoneTierLabel } from './presentation.js';

export interface ZoneCardProps {
  zone: ZoneView;
  /** 是否是当前在线战斗所在的秘境。 */
  current: boolean;
  /** §23：是否是当前挂机点。 */
  isIdleTarget?: boolean;
  /** §23：该秘境是否正在被设为挂机点（行级 loading）。 */
  idleBusy?: boolean;
  onEnter: (code: string) => void;
  /** §23：设为挂机点；不传则不渲染挂机入口（组件可插拔）。 */
  onSetIdleTarget?: (code: string) => void;
}

export function ZoneCard(props: ZoneCardProps) {
  const { zone, current, isIdleTarget = false, idleBusy = false, onEnter, onSetIdleTarget } = props;

  const idleButton =
    onSetIdleTarget === undefined || isIdleTarget ? null : zone.idleAllowed ? (
      <Button
        loading={idleBusy}
        onClick={() => onSetIdleTarget(zone.code)}
        data-testid={`zone-idle-set-${zone.code}`}
      >
        设为挂机点
      </Button>
    ) : (
      <Tooltip title="特殊秘境不可挂机">
        <span data-testid={`zone-idle-disabled-${zone.code}`}>
          <Button disabled>设为挂机点</Button>
        </span>
      </Tooltip>
    );

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
          {isIdleTarget ? (
            <Tag color="green" data-testid={`zone-idle-tag-${zone.code}`}>
              挂机点
            </Tag>
          ) : null}
        </Space>
      }
    >
      <Flex vertical gap={8}>
        <Typography.Text type="secondary">
          {zoneFloorText(zone.progress?.bestFloor, zone.maxFloor)} · {zoneClearsText(zone.progress?.clears)}
        </Typography.Text>

        <Space wrap>
          {current ? (
            <Typography.Text type="secondary">已在此秘境战斗</Typography.Text>
          ) : (
            <ConfirmAction title={`进入「${zone.name}」再打一轮？`} onConfirm={() => onEnter(zone.code)}>
              <Button data-testid={`zone-enter-${zone.code}`}>重复挑战</Button>
            </ConfirmAction>
          )}
          {idleButton}
        </Space>
      </Flex>
    </Card>
  );
}
