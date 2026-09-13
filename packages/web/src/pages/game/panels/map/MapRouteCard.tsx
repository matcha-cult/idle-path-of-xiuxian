/**
 * MapRouteCard —— 线路图卡（全景层：我在哪、能去哪）。
 *
 * 只渲染服务端已下发的节点（未发现 = 不下发，面板**不得自行造节点**），按 `ring`
 * 分组（外环 / 接引 / 八峰 / 内环 / 主峰）；每个节点显示已到达 / 传送点 / 挂机三态小点，
 * 以及由**已下发的边**推出的邻接节点名（悬挂边会被过滤，不崩、不泄露）。
 *
 * 点击节点 = 选中（详情由 `MapNodeCard` 展示），当前节点用 `primary` 按钮 + 「当前」标签高亮。
 * 协议字段不上屏：`code` 只做 key 与 testid，环层 / 类型都翻译成中文。
 */
import { Button, Flex, Tag, Typography } from 'antd';
import type { MapEdgeView, MapNodeView } from '@idle-path/ionet-transport';
import { EmptyHint } from '@idle-path/ui-kit';
import { MapNodeBadge } from './MapNodeBadge.js';
import { groupNodesByRing, neighborNames } from './presentation.js';

export interface MapRouteCardProps {
  nodes: readonly MapNodeView[];
  edges: readonly MapEdgeView[];
  /** 当前所在节点；null = 尚未定位（不高亮任何节点）。 */
  currentCode: string | null;
  onSelect: (code: string) => void;
}

export function MapRouteCard(props: MapRouteCardProps) {
  const { nodes, edges, currentCode, onSelect } = props;
  const groups = groupNodesByRing(nodes);
  const visible = new Map(nodes.map((node) => [node.code, node]));

  if (groups.length === 0) {
    return (
      <div data-testid="map-route-card">
        <EmptyHint compact description="暂无可显示的节点（未发现的地点不显示）" />
      </div>
    );
  }

  return (
    <Flex vertical gap={12} data-testid="map-route-card">
      {groups.map((group) => (
        <Flex vertical gap={8} key={group.ring} data-testid={`map-route-ring-${group.ring}`}>
          <Typography.Text strong>{group.label}</Typography.Text>
          <Flex wrap gap={12}>
            {group.nodes.map((node) => {
              const neighbors = neighborNames(node.code, edges, visible);
              return (
                <Flex vertical gap={2} key={node.code}>
                  <Button
                    type={node.code === currentCode ? 'primary' : 'default'}
                    data-testid={`map-route-node-${node.code}`}
                    onClick={() => onSelect(node.code)}
                  >
                    <Flex wrap gap={4} align="center">
                      <span>{node.name}</span>
                      {node.code === currentCode ? <Tag color="processing">当前</Tag> : null}
                      <MapNodeBadge
                        compact
                        visited={node.progress.visited}
                        waypointUnlocked={node.progress.waypointUnlocked}
                        idleUnlocked={node.progress.idleUnlocked}
                      />
                    </Flex>
                  </Button>
                  <Typography.Text type="secondary" data-testid={`map-route-neighbors-${node.code}`}>
                    {neighbors.length > 0 ? `邻接：${neighbors.join('、')}` : '邻接：无'}
                  </Typography.Text>
                </Flex>
              );
            })}
          </Flex>
        </Flex>
      ))}
    </Flex>
  );
}
