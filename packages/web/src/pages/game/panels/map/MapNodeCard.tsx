/**
 * MapNodeCard —— 单节点卡（详情层：到达这个节点能干什么）。
 *
 * 与 `MapRouteCard` 是两个不同信息层级：线路图回答「我在哪、能去哪」（全景），
 * 本卡回答「这个节点是什么、够不够打、有什么可做的」（单体）。
 *
 * 口径：
 * - 门槛对比只用服务端 `threshold` 与 `playerPower`，**恰好等于门槛 = 可进入**（§6.1 是 ≥）；
 * - 承载系统是否实现由客户端 `feature-registry` 判断，未实现走 `FeatureGate`（未开放 + 禁用入口）；
 * - `kind` 只有跑图 / 秘境 / 主峰三种；离线挂机只发生在**唯一的秘境节点（后山峰）**上，
 *   `progress.idleUnlocked` 由 zone 域击败首个 Boss 后置位，面板只做展示；
 * - **秘境节点额外给「进入历练」**：它把挂机目标切到该秘境（`zone.enter`）。
 *   这是「地图 → 历练秘境峰 → 开始挂机」的闭环 —— 用户定调「挂机只能在历练秘境峰」，
 *   所以从地图进秘境必须是一处**显式动作**（而不是 `map.enter` 的隐式副作用），
 *   跑图与「开始在这练」是两件事。未到达的节点不给这个入口。
 * - 「境界」展示的是 **`level`（怪物境界）**，能不能进只看 `threshold` 与 `playerPower`；
 * - 协议字段不上屏：`code` 只做 testid/key，`featureKey` 原文不展示。
 */
import { Button, Card, Flex, Tag, Tooltip, Typography } from 'antd';
import type { MapNodeView } from '@idle-path/ionet-transport';
import { KeyValueList, StatCompare, Toolbar, type KeyValueEntry } from '@idle-path/ui-kit';
import { FeatureGate } from './FeatureGate.js';
import { MapNodeBadge } from './MapNodeBadge.js';
import { featureIsImplemented, featureLabelOf } from './feature-registry.js';
import {
  canUseWaypoint,
  enterActionLabel,
  featureTextOf,
  isPowerEnough,
  nodeKindLabel,
  ringLabel,
  thresholdHint,
} from './presentation.js';

export interface MapNodeCardProps {
  node: MapNodeView;
  /** 玩家战力（服务端计算，仅用于对比展示）。 */
  playerPower: number;
  /** 是否当前所在节点。 */
  current: boolean;
  onEnter: (code: string) => void;
  onWaypoint: (code: string) => void;
  /** 秘境节点专用：把挂机目标切到该秘境（`zoneCode` 由服务端下发）。 */
  onEnterRealm?: (zoneCode: string) => void;
}

/** 节点属性明细（协议字段翻译成中文文案，不含 code / featureKey 原文）。 */
function detailEntries(node: MapNodeView, playerPower: number): KeyValueEntry[] {
  return [
    { key: 'level', label: '怪物境界', value: `第 ${node.level} 境` },
    { key: 'threshold', label: '战力门槛', value: node.threshold },
    { key: 'power', label: '我的战力', value: playerPower },
    { key: 'kind', label: '节点类型', value: nodeKindLabel(node.kind) },
    { key: 'system', label: '承载系统', value: featureTextOf(node.featureKey), span: 2 },
  ];
}

export function MapNodeCard(props: MapNodeCardProps) {
  const { node, playerPower, current, onEnter, onWaypoint, onEnterRealm } = props;
  const label = featureLabelOf(node.featureKey);
  const enough = isPowerEnough(playerPower, node.threshold);
  const waypointReady = canUseWaypoint(node, current ? node.code : null);
  const enterLabel = current ? '当前所在' : enterActionLabel(node);

  return (
    <Card
      variant="outlined"
      data-testid={`map-node-card-${node.code}`}
      title={
        <Flex wrap gap={8} align="center">
          <span>{node.name}</span>
          <Tag>{ringLabel(node.ring)}</Tag>
          <Tag>{nodeKindLabel(node.kind)}</Tag>
          {current ? <Tag color="processing">当前</Tag> : null}
        </Flex>
      }
    >
      <Flex vertical gap={12}>
        <MapNodeBadge
          visited={node.progress.visited}
          waypointUnlocked={node.progress.waypointUnlocked}
          idleUnlocked={node.progress.idleUnlocked}
        />

        <div data-testid={`map-node-compare-${node.code}`}>
          <StatCompare
            label="战力门槛对比"
            current={playerPower}
            target={node.threshold}
            okText="可以进入"
            failText="战力不足"
          />
        </div>

        <KeyValueList column={{ xs: 1, sm: 2 }} items={detailEntries(node, playerPower)} />

        {node.featureKey === null ? null : featureIsImplemented(node.featureKey) ? (
          <Tag color="success" data-testid={`map-node-feature-open-${node.code}`}>
            系统已开放：{label}
          </Tag>
        ) : (
          <FeatureGate
            label={label ?? '此地系统'}
            entry={<Button data-testid={`map-node-feature-entry-${node.code}`}>进入{label}</Button>}
          />
        )}

        <Toolbar
          left={
            <Flex wrap gap={8} align="center">
              <Tooltip title={thresholdHint(playerPower, node.threshold) || undefined}>
                {/* 禁用按钮不触发鼠标事件，需包一层 span 才能显示浮层 */}
                <span>
                  <Button
                    type="primary"
                    disabled={current || !enough}
                    data-testid={`map-node-enter-${node.code}`}
                    onClick={() => onEnter(node.code)}
                  >
                    {enterLabel}
                  </Button>
                </span>
              </Tooltip>
              {node.hasWaypoint ? (
                <Tooltip title={waypointReady ? undefined : '到达该节点后点亮传送点'}>
                  <span>
                    <Button
                      disabled={!waypointReady}
                      data-testid={`map-node-waypoint-${node.code}`}
                      onClick={() => onWaypoint(node.code)}
                    >
                      传送
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
              {/* 秘境节点：把挂机目标切到该秘境（「地图 → 历练秘境峰 → 挂机」的闭环） */}
              {node.kind === 'secret_realm' && node.zoneCode !== null && onEnterRealm !== undefined ? (
                <Tooltip title={node.progress.visited ? undefined : '先到达该节点'}>
                  <span>
                    <Button
                      type="primary"
                      ghost
                      disabled={!node.progress.visited}
                      data-testid={`map-node-enter-realm-${node.code}`}
                      onClick={() => node.zoneCode !== null && onEnterRealm(node.zoneCode)}
                    >
                      {node.progress.idleUnlocked ? '进入历练（可离线挂机）' : '进入历练'}
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </Flex>
          }
          right={current ? <Typography.Text type="secondary">已在此节点</Typography.Text> : null}
        />
      </Flex>
    </Card>
  );
}
