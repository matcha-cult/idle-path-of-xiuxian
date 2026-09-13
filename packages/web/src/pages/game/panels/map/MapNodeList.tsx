/**
 * `MapNodeList` —— 地图的**列表视图**（按环层分组的旧观感，§12.2「始终保留列表视图」）。
 *
 * 为什么保留：`n=21/sep=2` 时画布短边需求 ≥ 462px（§14.4），375px 手机上必然不足 ——
 * 列表视图是画布被挤小 / 坐标缺失（老服务端）时的兜底，也是习惯按分组找地点的人的入口。
 *
 * 本组件只做**分段头 + 复用 `MapRouteCard`**：分组、邻接、三态小点的规则一份都不重写，
 * `MapRouteCard` 的既有测试继续守着它。
 */
import { Flex, Typography } from 'antd';
import type { MapEdgeView, MapNodeView } from '@idle-path/ionet-transport';
import { MapCanvasLegend } from './MapCanvasLegend.js';
import { MapRouteCard } from './MapRouteCard.js';

export interface MapNodeListProps {
  nodes: readonly MapNodeView[];
  edges: readonly MapEdgeView[];
  currentCode: string | null;
  onSelect: (code: string) => void;
}

export function MapNodeList(props: MapNodeListProps) {
  const { nodes, edges, currentCode, onSelect } = props;
  return (
    <Flex vertical gap={8} data-testid="map-node-list">
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        列表视图（按环层分组）：画布放不下时的兜底。
      </Typography.Text>
      <MapCanvasLegend compact />
      <MapRouteCard nodes={nodes} edges={edges} currentCode={currentCode} onSelect={onSelect} />
    </Flex>
  );
}
