/**
 * `MapNodeList`：列表视图 = 原 `MapRouteCard` 观感（按环层分组 + 邻接 + 三态小点）。
 * 本组件只加「说明 + 紧凑图例」，分组规则一份都不重写 —— 因此这里断言的是**复用契约**。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import { MapNodeList } from './MapNodeList.js';

function progress(overrides: Partial<NodeProgressView> = {}): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false, ...overrides };
}

function node(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return {
    id: 1,
    code: 'n_1',
    name: '节点一',
    ring: 'outer',
    sector: 'E',
    kind: 'route',
    featureKey: null,
    level: 1,
    threshold: 10,
    hasWaypoint: false,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    gridRow: 1,
    gridCol: 1,
    description: null,
    progress: progress(),
    ...overrides,
  };
}

const OUTER = node({ id: 1, code: 'qy_gate_e', name: '东门', ring: 'outer' });
const INNER = node({ id: 2, code: 'qy_neimen', name: '内门广场', ring: 'inner', requiresNodeCode: 'qy_gate_e' });

describe('MapNodeList · 列表视图兜底', () => {
  it('按环层分组渲染，说明这是画布放不下时的兜底', () => {
    render(
      <MapNodeList
        nodes={[OUTER, INNER]}
        edges={[{ fromNodeCode: 'qy_gate_e', toNodeCode: 'qy_neimen', bidirectional: true }]}
        currentCode="qy_gate_e"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId('map-node-list')).toHaveTextContent('兜底');
    expect(screen.getByTestId('map-route-ring-outer')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-ring-inner')).toBeInTheDocument();
    expect(within(screen.getByTestId('map-route-card')).getByTestId('map-route-node-qy_gate_e')).toBeInTheDocument();
  });

  it('空节点表：走 EmptyHint，不崩', () => {
    render(<MapNodeList nodes={[]} edges={[]} currentCode={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-node-list')).toBeInTheDocument();
    expect(screen.getByText(/暂无可显示的节点/)).toBeInTheDocument();
  });

  it('点列表项只调 onSelect（不移动）', async () => {
    const onSelect = vi.fn();
    render(<MapNodeList nodes={[OUTER]} edges={[]} currentCode={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('map-route-node-qy_gate_e'));
    expect(onSelect).toHaveBeenCalledWith('qy_gate_e');
  });

  it('紧凑图例在场且不展示枢纽类型（列表里不需要）', () => {
    render(<MapNodeList nodes={[OUTER]} edges={[]} currentCode={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-canvas-legend')).toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas-legend-kind-waypoint')).toBeNull();
  });
});
