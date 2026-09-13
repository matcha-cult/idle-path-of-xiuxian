/**
 * MapPanel 容器测试：首屏不拉取 / 三态交给 AsyncBoundary / 线路图分组与高亮 /
 * 详情门槛对比 / 未开放系统 / 点节点发 MAP_CMD.enter / 点传送发 MAP_CMD.waypoint /
 * 边界（空节点、currentCode=null、悬挂边）/ 协议字段不上屏 / loadPanel 并发包含 map。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MAP_CMD, type MapEdgeView, type MapNodeView, type MapView, type NodeProgressView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { MapPanel } from './MapPanel.js';

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

function makeEdge(fromNodeCode: string, toNodeCode: string, bidirectional = true): MapEdgeView {
  return { fromNodeCode, toNodeCode, bidirectional };
}

function makeMap(nodes: MapNodeView[], edges: MapEdgeView[]): MapView {
  return {
    id: 1,
    code: 'map_qingyun',
    name: '青云宗',
    world: 'world_qingyun',
    orderIndex: 1,
    chapterFrom: 1,
    chapterTo: 2,
    requiresMapCode: null,
    description: null,
    nodes,
    edges,
  } as MapView;
}

const GATE_E = makeNode({ id: 1, code: 'qy_gate_e', name: '东门', ring: 'outer', threshold: 10, hasWaypoint: true });
const GATE_S = makeNode({
  id: 2,
  code: 'qy_gate_s',
  name: '南门',
  ring: 'outer',
  threshold: 10,
  hasWaypoint: true,
  progress: progress({ visited: true, waypointUnlocked: true }),
});
const APPROACH = makeNode({ id: 3, code: 'qy_approach', name: '外门接引区', ring: 'approach', threshold: 10 });
const HOUSHAN = makeNode({
  id: 4,
  code: 'qy_houshan',
  name: '后山峰',
  ring: 'peaks',
  kind: 'secret_realm',
  threshold: 115,
  zoneCode: 'zone_houshan',
});
const LINGTIAN = makeNode({
  id: 5,
  code: 'qy_lingtian',
  name: '灵田药园',
  ring: 'inner',
  kind: 'route',
  featureKey: 'farm',
  level: 5,
  threshold: 95,
});
const SUMMIT = makeNode({ id: 6, code: 'qy_summit', name: '青云主峰', ring: 'summit', kind: 'summit', threshold: 120 });

const NODES = [GATE_E, GATE_S, APPROACH, HOUSHAN, LINGTIAN, SUMMIT];
const EDGES = [makeEdge('qy_gate_e', 'qy_approach'), makeEdge('qy_approach', 'qy_houshan')];

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.map.maps = [makeMap(NODES, EDGES)];
    harness.root.map.nodes = NODES;
    harness.root.map.edges = EDGES;
    harness.root.map.playerPower = 100;
    harness.root.map.selectedMapCode = 'map_qingyun';
    seedFn?.(harness.root);
  });
  return harness;
}

describe('MapPanel · 首屏与三态', () => {
  it('挂载时不发请求（首屏由 RootStore.loadPanel 并发加载）', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    expect(harness.requests).toHaveLength(0);
  });

  it('RootStore.loadPanel 并发加载包含 map.list', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    // 必须已建立连接，请求才会真正发出（夹具约定）
    await harness.connect();
    await harness.root.loadPanel();
    await waitFor(() => expect(harness.requests.some((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.list)).toBe(true));
  });

  it('加载中显示 AsyncBoundary 骨架；错误显示错误态与重试', () => {
    const harness = setup((root) => {
      root.map.loading = true;
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
  });

  it('错误态交给 AsyncBoundary（不在面板里重判协议）', () => {
    const harness = setup((root) => {
      root.map.error = '地图加载失败';
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('async-boundary-error')).toHaveTextContent('地图加载失败');
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('空节点：AsyncBoundary 空态，不崩', () => {
    const harness = setup((root) => {
      root.map.nodes = [];
      root.map.edges = [];
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('async-boundary-empty')).toHaveTextContent('暂无可显示的地点');
    expect(screen.queryByTestId('map-node-card-n_1')).toBeNull();
  });

  it('概览统计给出战力/地点/传送点/秘境/离线挂机', () => {
    const harness = setup((root) => {
      root.map.playerPower = 100;
      root.map.nodes = NODES.map((node) => (node.code === 'qy_houshan' ? { ...node, progress: progress({ idleUnlocked: true }) } : node));
    });
    harness.render(<MapPanel />);
    const overview = screen.getByTestId('map-overview');
    expect(overview).toHaveTextContent('我的战力');
    expect(overview).toHaveTextContent('100');
    expect(overview).toHaveTextContent('已发现地点');
    expect(overview).toHaveTextContent('已点亮传送点');
    expect(overview).toHaveTextContent('秘境');
    expect(overview).toHaveTextContent('已解锁离线挂机');
  });
});

describe('MapPanel · 线路图与详情', () => {
  it('按环层分组渲染已下发节点', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    expect(within(screen.getByTestId('map-route-ring-outer')).getByTestId('map-route-node-qy_gate_e')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-ring-approach')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-ring-peaks')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-ring-inner')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-ring-summit')).toBeInTheDocument();
  });

  it('当前节点高亮', () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_approach';
    });
    harness.render(<MapPanel />);
    expect(within(screen.getByTestId('map-route-node-qy_approach')).getByText('当前')).toBeInTheDocument();
  });

  it('currentCode=null：线路图无「当前」标签，详情退回第一个节点', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    expect(screen.queryByText('当前')).toBeNull();
    expect(screen.getByTestId('map-node-card-qy_gate_e')).toBeInTheDocument();
  });

  it('详情默认展示当前所在节点', () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_houshan';
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('map-node-card-qy_houshan')).toHaveTextContent('后山峰');
  });

  it('点线路图节点切换详情（不直接发动作）', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await userEvent.click(screen.getByTestId('map-route-node-qy_lingtian'));
    expect(screen.getByTestId('map-node-card-qy_lingtian')).toBeInTheDocument();
    expect(harness.requests).toHaveLength(0);
  });

  it('未下发节点不出现；悬挂边不崩', () => {
    const harness = setup((root) => {
      root.map.nodes = [GATE_E, GATE_S];
      root.map.edges = [makeEdge('qy_gate_e', 'ghost_node'), makeEdge('qy_gate_e', 'qy_gate_s')];
    });
    harness.render(<MapPanel />);
    expect(screen.queryByTestId('map-route-node-ghost_node')).toBeNull();
    expect(screen.getByTestId('map-route-neighbors-qy_gate_e')).toHaveTextContent('南门');
  });
});

describe('MapPanel · 门槛对比（恰好等于 = 可进入）', () => {
  it('恰好等于门槛显示可进入', () => {
    const harness = setup((root) => {
      root.map.playerPower = 95;
      root.map.currentCode = 'qy_lingtian';
    });
    harness.render(<MapPanel />);
    const card = screen.getByTestId('map-node-card-qy_lingtian');
    expect(card).toHaveTextContent('95 / 95');
    expect(card).toHaveTextContent('可以进入');
  });

  it('差 1 显示战力不足且按钮禁用', () => {
    const harness = setup((root) => {
      root.map.playerPower = 94;
      root.map.currentCode = 'qy_lingtian';
    });
    harness.render(<MapPanel />);
    const card = screen.getByTestId('map-node-card-qy_lingtian');
    expect(card).toHaveTextContent('战力不足');
    expect(card).toHaveTextContent('差 1');
    expect(screen.getByTestId('map-node-enter-qy_lingtian')).toBeDisabled();
  });
});

describe('MapPanel · 未开放系统与三态', () => {
  it('灵田药园（farm 未实现）在详情卡渲染「未开放」且入口禁用', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await userEvent.click(screen.getByTestId('map-route-node-qy_lingtian'));
    expect(screen.getByTestId('feature-gate')).toHaveTextContent('未开放');
    expect(screen.getByTestId('map-node-feature-entry-qy_lingtian')).toBeDisabled();
  });

  it('后山峰解锁离线挂机后显示挂机徽标', () => {
    const harness = setup((root) => {
      root.map.nodes = NODES.map((node) =>
        node.code === 'qy_houshan' ? { ...node, progress: progress({ visited: true, idleUnlocked: true }) } : node,
      );
      root.map.currentCode = 'qy_houshan';
    });
    harness.render(<MapPanel />);
    const card = screen.getByTestId('map-node-card-qy_houshan');
    expect(within(card).getByTestId('map-node-badge-idle')).toHaveTextContent('离线挂机已解锁');
  });
});

describe('MapPanel · 交互（真的发出 Action）', () => {
  it('点「前往」发出 MAP_CMD.enter，payload 带 nodeCode', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('map-route-node-qy_gate_e'));
    await userEvent.click(screen.getByTestId('map-node-enter-qy_gate_e'));

    await waitFor(() => {
      const request = harness.requests.find((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.enter);
      expect(request).toBeDefined();
      expect(request?.data).toEqual({ nodeCode: 'qy_gate_e' });
    });
  });

  it('点「传送」发出 MAP_CMD.waypoint', async () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_approach';
    });
    harness.render(<MapPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('map-route-node-qy_gate_s'));
    await userEvent.click(screen.getByTestId('map-node-waypoint-qy_gate_s'));

    await waitFor(() => {
      const request = harness.requests.find((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.waypoint);
      expect(request).toBeDefined();
      expect(request?.data).toEqual({ nodeCode: 'qy_gate_s' });
    });
  });

  it('点「刷新地图」发出 MAP_CMD.list', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('map-refresh'));
    await waitFor(() =>
      expect(harness.requests.some((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.list)).toBe(true),
    );
  });
});

describe('MapPanel · 协议字段不上屏', () => {
  it('页面文本不含节点 code / featureKey 原文 / ISO 时间串', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('qy_gate_e');
    expect(text).not.toContain('qy_houshan');
    expect(text).not.toContain('farm');
    expect(text).not.toContain('featureKey');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
