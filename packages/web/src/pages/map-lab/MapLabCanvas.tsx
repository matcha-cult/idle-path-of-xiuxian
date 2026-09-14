/**
 * `MapLabCanvas` —— 把地图数据接到 ui-kit **`CanvasGraph`**（canvas 混合渲染版）上。
 *
 * 与旧 `MapCanvas` 的差别只有两点，其余口径完全一致（纯展示、不读 store、不发请求）：
 * 1. 渲染原语换成 `CanvasGraph`（canvas 画点阵/连线 + DOM 放枢纽）；
 * 2. 「可交互」判据换成 `waypoint-gate.travelDecision` —— **必须与传送点交互过**才可传送
 *    （旧版用服务端 `progress.waypointUnlocked`，那是「到达即点亮」，见 `waypoint-gate.ts`）。
 *
 * 不变的口径：
 * - 只画服务端已下发的节点与边；坐标是 0-based 交叉线索引（§14.1），前端不做布局计算；
 * - 连线是派生的，端点缺一即丢弃（悬挂边不崩）；
 * - **点击只选中**（§12.1）—— `onSelect` 由容器决定做什么，本组件绝不移动；
 * - 坐标缺失 / 越界的节点不进画布（宁可少一个点，也不要画到界外点不到）。
 *
 * 降级：`isCanvasGridReady` 为假时由容器切到列表视图（本组件仍会丢弃越界坐标的节点）。
 */
import { useMemo } from 'react';
import { Typography } from 'antd';
import type { MapEdgeView, MapNodeView } from '@idle-path/ionet-transport';
import { CanvasGraph, type CanvasGraphItem, type CanvasGraphLink } from '@idle-path/ui-kit';
import { MapNodePin } from '../game/panels/map/MapNodePin.js';
import {
  isNodeOnGrid,
  nodeVisualState,
  pinTooltipText,
  type NodeVisualState,
} from '../game/panels/map/canvas-view.js';
import { linkStateOf } from './lab-links.js';
import { travelDecision } from './waypoint-gate.js';

export interface MapLabCanvasProps {
  nodes: readonly MapNodeView[];
  edges: readonly MapEdgeView[];
  gridRows: number;
  gridCols: number;
  currentCode: string | null;
  selectedCode: string | null;
  /** 本会话已交互点亮的传送点（决定能否传送）。 */
  unlocked: ReadonlySet<string>;
  /** 点击枢纽。`source`：`tap` 单击（只选中）/ `double` 双击（PC 直达，§12.1）。 */
  onSelect: (code: string, source: 'tap' | 'double') => void;
  onBackgroundClick?: () => void;
  showGrid?: boolean;
  /** 画布高度（px）。整图适配按面板短边算，太扁会把图压小。 */
  height?: number;
}

export function MapLabCanvas(props: MapLabCanvasProps) {
  const {
    nodes,
    edges,
    gridRows,
    gridCols,
    currentCode,
    selectedCode,
    unlocked,
    onSelect,
    onBackgroundClick,
    showGrid = false,
    height = 560,
  } = props;

  /** 只保留两端都下发、且坐标在界的边（悬挂边 / 越界端点直接丢弃）。 */
  const links = useMemo<CanvasGraphLink[]>(
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
            state: linkStateOf(edge, [selectedCode, currentCode]),
          },
        ];
      }),
    [edges, nodes, gridRows, gridCols, selectedCode, currentCode],
  );

  /** 只画坐标合法的节点。 */
  const onGrid = useMemo(
    () => nodes.filter((node) => isNodeOnGrid(node, gridRows, gridCols)),
    [nodes, gridRows, gridCols],
  );

  const items = useMemo<CanvasGraphItem[]>(
    () =>
      onGrid.map((node) => {
        const state: NodeVisualState = nodeVisualState(node, currentCode);
        const decision = travelDecision(node, currentCode, unlocked);
        // 去不了 → 暗色 disabled（CanvasGraph 会跳过 onSelect，点击不改变选中态、双击也不移动），
        // 并在悬停里说明**为什么**（是「没交互」还是「没传送点」，两者文案不同）
        const reachable = decision.kind !== 'blocked';
        const base = pinTooltipText(node, state);
        return {
          key: node.code,
          row: node.gridRow,
          col: node.gridCol,
          title: reachable ? base : `${base} · ${decision.hint}`,
          selected: node.code === selectedCode,
          disabled: !reachable,
          content: (
            <MapNodePin node={node} state={state} emphasized={state === 'current'} disabled={!reachable} />
          ),
          onSelect: (source) => onSelect(node.code, source),
        };
      }),
    [onGrid, currentCode, selectedCode, unlocked, onSelect],
  );

  const offGridCount = nodes.length - onGrid.length;

  return (
    <div data-testid="map-lab-canvas" style={{ position: 'relative', height }}>
      {showGrid ? (
        <Typography.Text
          type="danger"
          data-testid="map-lab-canvas-grid-badge"
          style={{ position: 'absolute', zIndex: 2, top: 4, left: 8, fontSize: 11 }}
        >
          开发者网格：交叉线 0..{gridRows} / 0..{gridCols}
        </Typography.Text>
      ) : null}
      <CanvasGraph
        rows={gridRows}
        cols={gridCols}
        items={items}
        links={links}
        showGrid={showGrid}
        onBackgroundClick={onBackgroundClick}
        ariaLabel="地图线路画布（canvas 混合渲染）"
        cellPx={48}
      />
      {offGridCount === 0 ? null : (
        <Typography.Text type="warning" data-testid="map-lab-canvas-off-grid" style={{ fontSize: 12 }}>
          有 {offGridCount} 个地点缺少有效坐标，已在画布上省略（请检查种子）
        </Typography.Text>
      )}
    </div>
  );
}
