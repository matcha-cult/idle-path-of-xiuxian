/**
 * MapNodeBadge —— 节点三态徽标（已到达 / 传送点已点亮 / 离线挂机已解锁）。
 *
 * 两处复用（任务书 §2 的抽取依据）：线路图小点（`compact`，短文案）与节点详情卡（完整文案）。
 * 三个状态彼此独立（不是互斥枚举）：一个秘境节点可以「已到达 + 有传送点 + 已解锁挂机」。
 *
 * 颜色只用 antd 预设色名：`processing`（已到达）/ `gold`（传送点）/ `success`（挂机）。
 */
import { Flex, Tag } from 'antd';

export interface MapNodeBadgeProps {
  visited: boolean;
  waypointUnlocked: boolean;
  idleUnlocked: boolean;
  /** 线路图小点用短文案，详情卡用完整文案。 */
  compact?: boolean;
}

const FULL_TEXT = {
  visited: '已到达',
  unvisited: '未到达',
  waypoint: '传送点已点亮',
  idle: '离线挂机已解锁',
} as const;

const COMPACT_TEXT = {
  visited: '已到',
  unvisited: '未到',
  waypoint: '传送',
  idle: '挂机',
} as const;

export function MapNodeBadge(props: MapNodeBadgeProps) {
  const { visited, waypointUnlocked, idleUnlocked, compact = false } = props;
  const text = compact ? COMPACT_TEXT : FULL_TEXT;

  return (
    <Flex wrap gap={4} data-testid="map-node-badge" data-compact={compact ? 'true' : 'false'}>
      <Tag color={visited ? 'processing' : undefined} data-testid="map-node-badge-visited">
        {visited ? text.visited : text.unvisited}
      </Tag>
      {waypointUnlocked ? (
        <Tag color="gold" data-testid="map-node-badge-waypoint">
          {text.waypoint}
        </Tag>
      ) : null}
      {idleUnlocked ? (
        <Tag color="success" data-testid="map-node-badge-idle">
          {text.idle}
        </Tag>
      ) : null}
    </Flex>
  );
}
