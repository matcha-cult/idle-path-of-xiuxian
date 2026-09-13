/**
 * `MapCanvas` —— 把地图数据接到 ui-kit `GraphCanvas` 上（**纯展示层**，不读 store、不发请求）。
 *
 * 口径：
 * - 只画**服务端已下发**的节点与边（未发现不下发）；不自行造节点、不猜邻接（§5.2）；
 * - 坐标来自服务端（`gridRow` / `gridCol`，0-based 交叉线索引，§14.1），前端**不做布局计算**；
 * - 连线是**派生**的，不落库（§3.5）；端点缺一即丢弃（悬挂边不崩）；
 * - 点击枢纽**只选中**，绝不移动（§12.1）—— `onSelect` 由容器决定做什么。
 *
 * 降级：地图不是 21×21 或坐标缺失（老服务端 / 手改种子）时由容器切到列表视图；
 * 本组件仍会在坐标缺失时把该节点落在 (0,0) 之外——所以容器必须先判 `isCanvasGridReady`。
 */
import { useMemo } from 'react';
import { Typography } from 'antd';
import type { MapEdgeView, MapNodeView } from '@idle-path/ionet-transport';
import { GraphCanvas, type GraphCanvasItem, type GraphCanvasLink } from '@idle-path/ui-kit';
import { MapNodePin, ICON_PX } from './MapNodePin.js';
import {
  isNodeOnGrid,
  nodeVisualState,
  pinTooltipText,
  type NodeVisualState,
} from './canvas-view.js';

export interface MapCanvasProps {
  nodes: readonly MapNodeView[];
  edges: readonly MapEdgeView[];
  gridRows: number;
  gridCols: number;
  currentCode: string | null;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onBackgroundClick?: () => void;
  showGrid?: boolean;
  /** 画布高度（px）。整图适配按面板短边算，太扁会把图压小。 */
  height?: number;
}

/** 一条边的高亮状态：与选中/当前节点直接相连 → `active`。 */
function linkState(
  edge: MapEdgeView,
  focus: readonly (string | null)[],
): GraphCanvasLink['state'] {
  const codes = focus.filter((code): code is string => code !== null);
  if (codes.length === 0) return 'normal';
  if (codes.includes(edge.fromNodeCode) || codes.includes(edge.toNodeCode)) return 'active';
  return 'normal';
}

export function MapCanvas(props: MapCanvasProps) {
  const {
    nodes,
    edges,
    gridRows,
    gridCols,
    currentCode,
    selectedCode,
    onSelect,
    onBackgroundClick,
    showGrid = false,
    height = 560,
  } = props;

  /** 只保留两端都下发、且坐标在界的边（悬挂边 / 越界端点直接丢弃）。 */
  const links = useMemo<GraphCanvasLink[]>(
    () =>
      edges.flatMap((edge) => {
        const from = nodes.find((node) => node.code === edge.fromNodeCode);
        const to = nodes.find((node) => node.code === edge.toNodeCode);
        if (from === undefined || to === undefined) return [];
        if (!isNodeOnGrid(from, gridRows, gridCols) || !isNodeOnGrid(to, gridRows, gridCols)) return [];
        return [
          {
            from: edge.fromNodeCode,
            to: edge.toNodeCode,
            state: linkState(edge, [selectedCode, currentCode]),
          },
        ];
      }),
    [edges, nodes, gridRows, gridCols, selectedCode, currentCode],
  );

  /** 只画坐标合法的节点：越界 / 缺列一律不进画布（宁可少一个点，也不要画到界外点不到）。 */
  const onGrid = useMemo(
    () => nodes.filter((node) => isNodeOnGrid(node, gridRows, gridCols)),
    [nodes, gridRows, gridCols],
  );

  const items = useMemo<GraphCanvasItem[]>(
    () =>
      onGrid.map((node) => {
        const state: NodeVisualState = nodeVisualState(node, currentCode);
        return {
          key: node.code,
          row: node.gridRow,
          col: node.gridCol,
          title: pinTooltipText(node, state),
          selected: node.code === selectedCode,
          content: (
            <MapNodePin node={node} state={state} emphasized={state === 'current'} />
          ),
          onSelect: () => onSelect(node.code),
        };
      }),
    [onGrid, currentCode, selectedCode, onSelect],
  );

  const offGridCount = nodes.length - onGrid.length;

  return (
    <div data-testid="map-canvas" style={{ position: 'relative', height }}>
      {showGrid ? (
        <Typography.Text
          type="danger"
          data-testid="map-canvas-grid-badge"
          style={{ position: 'absolute', zIndex: 2, top: 4, left: 8, fontSize: 11 }}
        >
          开发者网格：交叉线 0..{gridRows} / 0..{gridCols}（图标 {ICON_PX}px）
        </Typography.Text>
      ) : null}
      <GraphCanvas
        rows={gridRows}
        cols={gridCols}
        items={items}
        links={links}
        showGrid={showGrid}
        onBackgroundClick={onBackgroundClick}
        ariaLabel="地图线路画布"
        cellPx={48}
      />
      {offGridCount === 0 ? null : (
        <Typography.Text type="warning" data-testid="map-canvas-off-grid" style={{ fontSize: 12 }}>
          有 {offGridCount} 个地点缺少有效坐标，已在画布上省略（请检查种子）
        </Typography.Text>
      )}
    </div>
  );
}
