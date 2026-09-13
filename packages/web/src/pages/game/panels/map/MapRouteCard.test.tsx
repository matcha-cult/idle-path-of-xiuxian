/**
 * MapRouteCard 单测：只渲染已下发节点 / 按 ring 分组 / 当前节点高亮 /
 * 邻接可视化（含悬挂边防御）/ 空态 / 点击选中回调。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MapEdgeView, MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import { MapRouteCard } from './MapRouteCard.js';

function progress(overrides: Partial<NodeProgressView> = {}): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false, ...overrides };
}

function makeNode(overrides: Partial<MapNodeView> = {}): MapNodeView {
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
    progress: progress(),
    ...overrides,
  } as MapNodeView;
}

function makeEdge(from: string, to: string, bidirectional = true): MapEdgeView {
  return { fromNodeCode: from, toNodeCode: to, bidirectional };
}

const OUTER_A = makeNode({ id: 1, code: 'gate_a', name: '东门', ring: 'outer', hasWaypoint: true });
const OUTER_B = makeNode({ id: 2, code: 'gate_b', name: '南门', ring: 'outer' });
const PEAK = makeNode({ id: 3, code: 'peak_x', name: '天枢峰', ring: 'peaks', featureKey: 'profession' });

describe('MapRouteCard · 只渲染已下发节点 + ring 分组', () => {
  it('按 ring 分组，组内节点都在', () => {
    render(<MapRouteCard nodes={[OUTER_A, OUTER_B, PEAK]} edges={[]} currentCode={null} onSelect={vi.fn()} />);

    expect(within(screen.getByTestId('map-route-ring-outer')).getByTestId('map-route-node-gate_a')).toBeInTheDocument();
    expect(within(screen.getByTestId('map-route-ring-outer')).getByTestId('map-route-node-gate_b')).toBeInTheDocument();
    expect(within(screen.getByTestId('map-route-ring-peaks')).getByTestId('map-route-node-peak_x')).toBeInTheDocument();
    // 分组顺序：外环在前，八峰在后
    expect(screen.getByTestId('map-route-ring-outer').compareDocumentPosition(screen.getByTestId('map-route-ring-peaks'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('未下发的节点不出现（面板不得自行造节点）', () => {
    render(<MapRouteCard nodes={[OUTER_A]} edges={[]} currentCode={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-route-node-gate_a')).toBeInTheDocument();
    expect(screen.queryByTestId('map-route-node-gate_b')).toBeNull();
    expect(screen.queryByTestId('map-route-ring-peaks')).toBeNull();
  });

  it('空节点给空态，不崩', () => {
    render(<MapRouteCard nodes={[]} edges={[]} currentCode={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-route-card')).toHaveTextContent('暂无可显示的节点');
  });
});

describe('MapRouteCard · 当前节点高亮', () => {
  it('当前节点用 primary 按钮 + 「当前」标签', () => {
    render(<MapRouteCard nodes={[OUTER_A, OUTER_B]} edges={[]} currentCode="gate_a" onSelect={vi.fn()} />);
    const current = screen.getByTestId('map-route-node-gate_a');
    expect(current).toHaveClass('ant-btn-primary');
    expect(within(current).getByText('当前')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-node-gate_b')).not.toHaveClass('ant-btn-primary');
  });

  it('currentCode 为 null 时不崩且没有「当前」标签', () => {
    render(<MapRouteCard nodes={[OUTER_A, OUTER_B]} edges={[]} currentCode={null} onSelect={vi.fn()} />);
    expect(screen.queryByText('当前')).toBeNull();
  });
});

describe('MapRouteCard · 三态小点', () => {
  it('已到达 / 传送点 / 挂机三态用短文案渲染', () => {
    const node = makeNode({
      code: 'realm',
      name: '后山峰',
      kind: 'secret_realm',
      progress: progress({ visited: true, waypointUnlocked: true, idleUnlocked: true }),
    });
    render(<MapRouteCard nodes={[node]} edges={[]} currentCode={null} onSelect={vi.fn()} />);
    const badge = within(screen.getByTestId('map-route-node-realm')).getByTestId('map-node-badge');
    expect(badge).toHaveTextContent('已到');
    expect(badge).toHaveTextContent('传送');
    expect(badge).toHaveTextContent('挂机');
  });
});

describe('MapRouteCard · 邻接可视化（悬挂边防御）', () => {
  it('双向边在两侧都显示对方名称', () => {
    render(<MapRouteCard nodes={[OUTER_A, OUTER_B]} edges={[makeEdge('gate_a', 'gate_b')]} currentCode={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-route-neighbors-gate_a')).toHaveTextContent('邻接：南门');
    expect(screen.getByTestId('map-route-neighbors-gate_b')).toHaveTextContent('邻接：东门');
  });

  it('边引用未下发节点时不崩、也不显示该邻接', () => {
    render(
      <MapRouteCard
        nodes={[OUTER_A, OUTER_B]}
        edges={[makeEdge('gate_a', 'ghost'), makeEdge('gate_a', 'gate_b')]}
        currentCode={null}
        onSelect={vi.fn()}
      />,
    );
    const neighbors = screen.getByTestId('map-route-neighbors-gate_a');
    expect(neighbors).toHaveTextContent('南门');
    expect(neighbors).not.toHaveTextContent('ghost');
  });

  it('没有邻接时显示「无」', () => {
    render(<MapRouteCard nodes={[OUTER_A]} edges={[]} currentCode={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-route-neighbors-gate_a')).toHaveTextContent('邻接：无');
  });

  it('协议 code 不上屏（只做 testid）', () => {
    render(<MapRouteCard nodes={[OUTER_A, OUTER_B]} edges={[makeEdge('gate_a', 'gate_b')]} currentCode={null} onSelect={vi.fn()} />);
    const route = screen.getByTestId('map-route-card');
    expect(route).not.toHaveTextContent('gate_a');
    expect(route).not.toHaveTextContent('gate_b');
    expect(route).not.toHaveTextContent('profession');
  });
});

describe('MapRouteCard · 交互', () => {
  it('点击节点回调其 code（选中，不直接发动作）', async () => {
    const onSelect = vi.fn();
    render(<MapRouteCard nodes={[OUTER_A, OUTER_B]} edges={[]} currentCode={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('map-route-node-gate_b'));
    expect(onSelect).toHaveBeenCalledWith('gate_b');
  });
});
