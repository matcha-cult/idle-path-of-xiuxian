/**
 * MapNodeCard —— 单节点卡（详情层：到达这个节点能干什么）。
 *
 * 与 `MapRouteCard` 是两个不同信息层级：线路图回答「我在哪、能去哪」（全景），
 * 本卡回答「这个节点是什么、有什么可做的」（单体）。
 *
 * 口径（P2.0 v3 §3 / §5）：
 * - **战力只展示、不拦路**：`threshold` 降级为「难度参考」，`前往此地` 只看 `node.adjacent`；
 * - **前往**：相邻（服务端 `adjacent`，山门恒为相邻）且不是当前所在才可点；
 * - **传送**：`hasWaypoint` 且传送点已点亮才可点（语义一个字未改）；
 * - 一院多职能走 `MapObjectList`（节点 `featureKey` 是摘要，对象表是明细）；
 * - 「秘境节点额外给『进入历练』」：显式动作把挂机目标切到该秘境（`zone.enter`）；
 * - 协议字段不上屏：`code` 只做 testid/key，`featureKey` 原文不展示。
 */
import { Button, Card, Flex, Tag, Tooltip, Typography } from 'antd';
import type { MapNodeView, MapObjectView } from '@idle-path/ionet-transport';
import { KeyValueList, StatCompare, Toolbar, type KeyValueEntry } from '@idle-path/ui-kit';
import { MapNodeBadge } from './MapNodeBadge.js';
import { MapObjectList } from './MapObjectList.js';
import {
  canUseWaypoint,
  enterActionLabel,
  featureTextOf,
  nodeKindLabel,
  ringLabel,
} from './presentation.js';

export interface MapNodeCardProps {
  node: MapNodeView;
  /** 玩家战力（服务端计算，仅用于对比展示 —— v3 起不再作为前往闸门）。 */
  playerPower: number;
  /** 是否当前所在节点。 */
  current: boolean;
  /** 该节点的职能对象（P2.0 §3；容器按宿主 `nodeCode` 过滤后传入）。 */
  objects?: readonly MapObjectView[];
  /** 「前往 / 传送」请求进行中（按钮级 loading；面板内容不卸载）。 */
  moving?: boolean;
  /** 正在移动的目标节点 code（loading 只给它）。 */
  movingTo?: string | null;
  onEnter: (code: string) => void;
  onWaypoint: (code: string) => void;
  /** 秘境节点专用：把挂机目标切到该秘境（`zoneCode` 由服务端下发）。 */
  onEnterRealm?: (zoneCode: string) => void;
}

/** 节点属性明细（协议字段翻译成中文文案，不含 code / featureKey 原文）。 */
function detailEntries(node: MapNodeView, playerPower: number): KeyValueEntry[] {
  return [
    { key: 'level', label: '怪物境界', value: `第 ${node.level} 境` },
    { key: 'threshold', label: '难度参考门槛', value: node.threshold },
    { key: 'power', label: '我的战力', value: playerPower },
    { key: 'kind', label: '节点类型', value: nodeKindLabel(node.kind) },
    { key: 'system', label: '承载系统', value: featureTextOf(node.featureKey), span: 2 },
  ];
}

export function MapNodeCard(props: MapNodeCardProps) {
  const {
    node,
    playerPower,
    current,
    objects = [],
    moving = false,
    movingTo = null,
    onEnter,
    onWaypoint,
    onEnterRealm,
  } = props;
  const waypointReady = canUseWaypoint(node, current ? node.code : null);
  const enterLabel = current ? '当前所在' : enterActionLabel(node);
  // v3 §5：前往只看相邻（山门由服务端恒置 adjacent=true）；战力不参与。
  const canEnter = !current && node.adjacent;
  // 移动中的反馈**只落在按钮上**：面板（画布 / 详情）全程保持挂载，不闪骨架屏（B1）
  const thisTarget = moving && movingTo === node.code;
  const enterHint = current
    ? undefined
    : node.adjacent
      ? undefined
      : '与当前所在地不相邻：需先到相邻地点，或点亮传送点后传送';

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
            label="战力门槛（仅参考）"
            current={playerPower}
            target={node.threshold}
            okText="战力充足"
            failText="战力偏低"
          />
        </div>

        <KeyValueList column={{ xs: 1, sm: 2 }} items={detailEntries(node, playerPower)} />

        <MapObjectList objects={objects} hostCode={node.code} />

        <Toolbar
          left={
            <Flex wrap gap={8} align="center">
              <Tooltip title={enterHint}>
                {/* 禁用按钮不触发鼠标事件，需包一层 span 才能显示浮层 */}
                <span>
                  <Button
                    type="primary"
                    disabled={!canEnter || moving}
                    loading={thisTarget}
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
                      disabled={!waypointReady || moving}
                      loading={thisTarget}
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
