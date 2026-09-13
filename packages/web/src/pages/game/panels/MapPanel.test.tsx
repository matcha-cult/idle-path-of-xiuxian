/**
 * MapPanel 容器测试（P1 画布版）。
 *
 * 保留原有用例的**业务口径**（首屏不拉取 / 三态交给 AsyncBoundary / 门槛对比 / 未开放系统 /
 * 协议字段不上屏 / 秘境闭环），把「线路图」相关断言迁到**列表视图**（列表视图 = 原 `MapRouteCard`），
 * 并新增 P1 的交互契约与画布用例：
 * - **点击枢纽只选中，绝不移动**（§12.1）—— 这是反直觉的那条，必须被测试钉住；
 * - 移动只走右栏「前往此地」按钮；PC 双击直达；
 * - 底部常驻提示条在 PC / 移动端文案不同；
 * - `?mapGrid=1` 出开发者网格；坐标缺失时自动降级到列表视图；
 * - `<md` 时右栏降级为底部 Drawer。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  MAP_CMD,
  ZONE_CMD,
  type MapEdgeView,
  type MapNodeView,
  type MapObjectView,
  type MapView,
  type NodeProgressView,
} from '@idle-path/ionet-transport';
import { setViewportWidth } from '@idle-path/ui-kit/testing';
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
    gridRow: 5,
    gridCol: 5,
    description: null,
    // 默认「可交互」（相邻）；不可交互的用例显式 adjacent:false + 未点亮传送点
    adjacent: true,
    progress: progress(),
    ...overrides,
  };
}

function makeEdge(fromNodeCode: string, toNodeCode: string, bidirectional = true): MapEdgeView {
  return { fromNodeCode, toNodeCode, bidirectional };
}

function makeMap(nodes: MapNodeView[], edges: MapEdgeView[], overrides: Partial<MapView> = {}): MapView {
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
    gridRows: 21,
    gridCols: 21,
    backgroundKey: null,
    currentNodeCode: null,
    objects: [],
    nodes,
    edges,
    ...overrides,
  };
}

const GATE_E = makeNode({ id: 1, code: 'qy_gate_e', name: '东门', ring: 'outer', threshold: 10, hasWaypoint: true, gridRow: 10, gridCol: 21 });
const GATE_S = makeNode({
  id: 2,
  code: 'qy_gate_s',
  name: '南门',
  ring: 'outer',
  threshold: 10,
  hasWaypoint: true,
  gridRow: 21,
  gridCol: 10,
  progress: progress({ visited: true, waypointUnlocked: true }),
});
const APPROACH = makeNode({ id: 3, code: 'qy_approach', name: '外门接引区', ring: 'approach', threshold: 10, gridRow: 1, gridCol: 8 });
const HOUSHAN = makeNode({
  id: 4,
  code: 'qy_houshan',
  name: '后山峰',
  ring: 'peaks',
  kind: 'secret_realm',
  threshold: 115,
  zoneCode: 'zone_houshan',
  gridRow: 4,
  gridCol: 1,
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
  gridRow: 12,
  gridCol: 6,
});
const SUMMIT = makeNode({ id: 6, code: 'qy_summit', name: '青云主峰', ring: 'summit', kind: 'summit', threshold: 120, gridRow: 10, gridCol: 10 });
/** 四院之一：一院多职能（P2.0 §3），右栏对象列表用它验证。 */
const BAIGONG = makeNode({
  id: 7,
  code: 'qy_baigongyuan',
  name: '百工院',
  ring: 'inner',
  kind: 'route',
  featureKey: 'alchemy',
  level: 5,
  threshold: 75,
  gridRow: 15,
  gridCol: 10,
});

const OBJECTS: MapObjectView[] = [
  { id: 1, code: 'obj_danxiayuan', nodeCode: 'qy_baigongyuan', kind: 'office', name: '丹霞院', featureKey: 'alchemy', description: '炉火整日不熄。', orderIndex: 1 },
  { id: 2, code: 'obj_baiqige', nodeCode: 'qy_baigongyuan', kind: 'office', name: '百器阁', featureKey: 'craft', description: null, orderIndex: 2 },
];

const NODES = [GATE_E, GATE_S, APPROACH, HOUSHAN, LINGTIAN, SUMMIT, BAIGONG];
const EDGES = [makeEdge('qy_gate_e', 'qy_approach'), makeEdge('qy_approach', 'qy_houshan')];

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.map.maps = [makeMap(NODES, EDGES, { objects: OBJECTS })];
    harness.root.map.nodes = NODES;
    harness.root.map.edges = EDGES;
    harness.root.map.playerPower = 100;
    harness.root.map.selectedMapCode = 'map_qingyun';
    seedFn?.(harness.root);
  });
  return harness;
}

/** 画布里的枢纽节点（GraphCanvas 用 data-graph-item 标记命中目标）。 */
function pin(code: string): HTMLElement {
  return screen.getByTestId(`graph-canvas-item-${code}`);
}

/**
 * jsdom 的 `PointerEvent` 不带 `pointerId` / `clientX/Y`，`fireEvent.pointerDown(..., { clientX })`
 * 传不进位移；手工造一个带这些属性的普通事件派发（React 18 的 onPointer* 照常触发）。
 */
function pointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup'): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
  target.dispatchEvent(event);
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
    await harness.connect();
    await harness.root.loadPanel();
    await waitFor(() =>
      expect(harness.requests.some((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.list)).toBe(true),
    );
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
      root.map.nodes = NODES.map((node) =>
        node.code === 'qy_houshan' ? { ...node, progress: progress({ idleUnlocked: true }) } : node,
      );
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

describe('MapPanel · 画布（缺省视图）', () => {
  it('画布渲染每个已下发节点，图上不写名字', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
    for (const node of NODES) expect(pin(node.code)).toBeInTheDocument();
    expect(within(screen.getByTestId('map-canvas')).queryByText('东门')).toBeNull();
  });

  it('全量下发：17 个节点全部渲染到画布（P2.0 §7）', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      makeNode({ id: 100 + i, code: `qy_n_${i}`, name: `点${i}`, gridRow: i, gridCol: i, adjacent: i < 4 }),
    );
    const harness = setup((root) => {
      root.map.nodes = many;
      root.map.edges = [];
    });
    harness.render(<MapPanel />);
    for (const n of many) expect(screen.getByTestId(`graph-canvas-item-${n.code}`)).toBeInTheDocument();
    expect(screen.getAllByTestId(/^graph-canvas-item-qy_n_/)).toHaveLength(17);
  });

  it('当前节点是 current 态、已到达是 visited 态、其余是 known 态', () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_houshan';
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('map-node-pin-qy_houshan')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('map-node-pin-qy_gate_s')).toHaveAttribute('data-state', 'visited');
    expect(screen.getByTestId('map-node-pin-qy_gate_e')).toHaveAttribute('data-state', 'known');
  });

  it('详情默认展示当前所在节点', () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_houshan';
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('map-node-card-qy_houshan')).toHaveTextContent('后山峰');
  });

  it('currentCode=null：画布无 current 态，详情退回第一个节点', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    expect(screen.queryByTestId('map-node-pin-qy_gate_e')).not.toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('map-node-card-qy_gate_e')).toBeInTheDocument();
  });

  it('列表视图切换保留（原 MapRouteCard 观感）', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await userEvent.click(within(screen.getByTestId('map-view-switch')).getByText('列表'));
    expect(screen.getByTestId('map-node-list')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-card')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-ring-outer')).toBeInTheDocument();
    expect(screen.getByTestId('map-route-node-qy_gate_e')).toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas')).toBeNull();
  });

  it('坐标缺失（老服务端）时强制降级到列表视图，不崩', () => {
    const harness = setup((root) => {
      root.map.maps = [makeMap(NODES, EDGES, { gridRows: 0, gridCols: 0 })];
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('map-node-list')).toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas')).toBeNull();
    expect(screen.getByTestId('map-route-node-qy_gate_e')).toBeInTheDocument();
  });

  it('未下发节点不出现；悬挂边不崩（列表视图的邻接文案）', async () => {
    const harness = setup((root) => {
      root.map.nodes = [GATE_E, GATE_S];
      root.map.edges = [makeEdge('qy_gate_e', 'ghost_node'), makeEdge('qy_gate_e', 'qy_gate_s')];
    });
    harness.render(<MapPanel />);
    expect(screen.queryByTestId('graph-canvas-item-ghost_node')).toBeNull();
    await userEvent.click(within(screen.getByTestId('map-view-switch')).getByText('列表'));
    expect(screen.getByTestId('map-route-neighbors-qy_gate_e')).toHaveTextContent('南门');
  });

  it('右栏对象列表：选中百工院时列出「丹霞院 / 百器阁」两项（T9）', () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_baigongyuan';
    });
    harness.render(<MapPanel />);
    const list = screen.getByTestId('map-objects-qy_baigongyuan');
    expect(list).toHaveTextContent('丹霞院');
    expect(list).toHaveTextContent('百器阁');
    // 炼丹未实现 -> FeatureGate 禁用入口；炼器已实现 -> 已开放标签
    expect(screen.getByTestId('map-object-entry-obj_danxiayuan')).toBeDisabled();
    expect(screen.getByTestId('map-object-open-obj_baiqige')).toHaveTextContent('已开放');
  });

  it('右栏对象列表：切到别的节点后只剩该节点的对象（按宿主过滤）', () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_summit';
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('map-objects-empty-qy_summit')).toBeInTheDocument();
    expect(screen.queryByTestId('map-objects-qy_baigongyuan')).toBeNull();
  });
});

describe('MapPanel · 点击只选中（§12.1 反直觉契约）', () => {
  it('点枢纽只切详情，不发任何 Action', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await harness.connect();

    pointer(pin('qy_lingtian'), 'pointerdown');
    pointer(pin('qy_lingtian'), 'pointerup');

    await waitFor(() => expect(screen.getByTestId('map-node-card-qy_lingtian')).toBeInTheDocument());
    expect(harness.requests).toHaveLength(0);
  });

  it('不可交互枢纽（不相邻 + 传送点未点亮）：点击不改变选中态', async () => {
    const harness = setup((root) => {
      root.map.nodes = root.map.nodes.map((node) =>
        node.code === 'qy_lingtian' ? { ...node, adjacent: false, progress: progress() } : node,
      );
    });
    harness.render(<MapPanel />);
    await harness.connect();

    const locked = pin('qy_lingtian');
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    pointer(locked, 'pointerdown');
    pointer(locked, 'pointerup');

    // 详情仍是默认的东门，没有切到灵田药园
    expect(screen.getByTestId('map-node-card-qy_gate_e')).toBeInTheDocument();
    expect(screen.queryByTestId('map-node-card-qy_lingtian')).toBeNull();
    expect(harness.requests).toHaveLength(0);
  });

  it('移动只走右栏「前往此地」：点按钮才发 MAP_CMD.enter', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await harness.connect();

    pointer(pin('qy_gate_e'), 'pointerdown');
    pointer(pin('qy_gate_e'), 'pointerup');
    expect(harness.requests).toHaveLength(0);

    await userEvent.click(screen.getByTestId('map-node-enter-qy_gate_e'));
    await waitFor(() => {
      const request = harness.requests.find((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.enter);
      expect(request).toBeDefined();
      expect(request?.data).toEqual({ nodeCode: 'qy_gate_e' });
    });
  });

  it('PC 双击枢纽直达（发出 MAP_CMD.enter）', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await harness.connect();

    const target = pin('qy_gate_e');
    pointer(target, 'pointerdown');
    pointer(target, 'pointerup');
    pointer(target, 'pointerdown');
    pointer(target, 'pointerup');

    await waitFor(() => {
      const request = harness.requests.find((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.enter);
      expect(request?.data).toEqual({ nodeCode: 'qy_gate_e' });
    });
  });

  it('点空白处取消详情抽屉（不移动）', async () => {
    const harness = setup();
    harness.render(<MapPanel />);
    await harness.connect();
    const canvas = screen.getByTestId('graph-canvas');
    pointer(canvas, 'pointerdown');
    pointer(canvas, 'pointerup');
    expect(harness.requests).toHaveLength(0);
  });

  it('底部常驻提示条教「点击只选中」（PC 文案含双击）', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    const hint = screen.getByTestId('map-hint-bar');
    expect(hint).toHaveTextContent('点击枢纽查看详情');
    expect(hint).toHaveTextContent('双击前往');
    expect(hint).toHaveTextContent('须在枢纽处与传送点交互方可点亮');
  });
});

describe('MapPanel · 战力门槛只做展示（P2.0 v3 §5：不再拦前往）', () => {
  it('恰好等于门槛显示「战力充足」', () => {
    const harness = setup((root) => {
      root.map.playerPower = 95;
      root.map.currentCode = 'qy_lingtian';
    });
    harness.render(<MapPanel />);
    const card = screen.getByTestId('map-node-card-qy_lingtian');
    expect(card).toHaveTextContent('95 / 95');
    expect(card).toHaveTextContent('战力充足');
  });

  it('差 1 只显示「战力偏低」，前往按钮**仍然可用**（防回归）', async () => {
    const harness = setup((root) => {
      root.map.playerPower = 1;
      root.map.currentCode = 'qy_gate_s';
    });
    harness.render(<MapPanel />);
    // 选中灵田药园（非当前所在、相邻）——战力远低于门槛也必须可前往
    pointer(pin('qy_lingtian'), 'pointerdown');
    pointer(pin('qy_lingtian'), 'pointerup');
    await waitFor(() => expect(screen.getByTestId('map-node-card-qy_lingtian')).toBeInTheDocument());
    expect(screen.getByTestId('map-node-card-qy_lingtian')).toHaveTextContent('战力偏低');
    expect(screen.getByTestId('map-node-enter-qy_lingtian')).toBeEnabled();
  });
});

describe('MapPanel · 未开放系统与三态（对象层）', () => {
  it('百工院 · 丹霞院（alchemy 未实现）在详情卡渲染「未开放」且入口禁用', () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_baigongyuan';
    });
    harness.render(<MapPanel />);
    expect(screen.getByTestId('feature-gate')).toHaveTextContent('未开放');
    expect(screen.getByTestId('map-object-entry-obj_danxiayuan')).toBeDisabled();
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
  it('点「传送」发出 MAP_CMD.waypoint', async () => {
    const harness = setup((root) => {
      root.map.currentCode = 'qy_approach';
    });
    harness.render(<MapPanel />);
    await harness.connect();

    pointer(pin('qy_gate_s'), 'pointerdown');
    pointer(pin('qy_gate_s'), 'pointerup');

    await waitFor(() => expect(screen.getByTestId('map-node-waypoint-qy_gate_s')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('map-node-waypoint-qy_gate_s'));
    await waitFor(() => {
      const request = harness.requests.find((r) => r.cmd === MAP_CMD.cmd && r.subCmd === MAP_CMD.waypoint);
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
  it('画布视图文本不含节点 code / featureKey 原文 / ISO 时间串', () => {
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

describe('MapPanel · 开发者网格（§13）', () => {
  it('缺省（测试环境 DEV=true）显示网格与坐标标注', () => {
    const harness = setup();
    harness.render(<MapPanel />);
    expect(screen.getByTestId('graph-canvas-grid')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas-item-coord-qy_gate_e')).toHaveTextContent('10,21');
  });

  it('?mapGrid=0 关掉网格与坐标', () => {
    // jsdom 的 history.replaceState 不更新 location.search，直接替换属性最可靠
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: '?mapGrid=0' },
    });
    try {
      const harness = setup();
      harness.render(<MapPanel />);
      expect(screen.queryByTestId('graph-canvas-grid')).toBeNull();
      expect(screen.queryByTestId('graph-canvas-item-coord-qy_gate_e')).toBeNull();
    } finally {
      if (original !== undefined) Object.defineProperty(window, 'location', original);
    }
  });
});

describe('MapPanel · 移动端（<md 右栏降级为底部 Drawer）', () => {
  it('窄屏隐藏内联详情、给出 Drawer 入口与触屏文案', async () => {
    setViewportWidth(393);
    const harness = setup();
    harness.render(<MapPanel />);

    expect(screen.getByTestId('map-detail-open')).toBeInTheDocument();
    expect(screen.queryByTestId('map-node-card-qy_gate_e')).toBeNull();
    expect(screen.getByTestId('map-hint-bar')).toHaveTextContent('轻点枢纽查看详情');
    expect(screen.getByTestId('map-hint-bar')).not.toHaveTextContent('双击前往');

    await userEvent.click(screen.getByTestId('map-detail-open'));
    await waitFor(() => expect(screen.getByTestId('map-node-card-qy_gate_e')).toBeInTheDocument());
  });
});

describe('MapPanel · 地图→历练秘境峰→挂机的闭环（用户定调：挂机只能在历练秘境峰）', () => {
  it('点秘境节点的「进入历练」发出 zone.enter，payload 带 zoneCode（不是节点 code）', async () => {
    const harness = setup((root) => {
      root.map.nodes = NODES.map((node) =>
        node.code === 'qy_houshan' ? { ...node, progress: progress({ visited: true }) } : node,
      );
      root.map.currentCode = 'qy_houshan';
    });
    harness.render(<MapPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('map-node-enter-realm-qy_houshan'));

    await waitFor(() => {
      const request = harness.requests.find((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.enter);
      expect(request).toBeDefined();
      // zone 域要的是秘境 code；传成地图节点 code 会让「进入历练」静默失败
      expect(request?.data).toEqual({ zoneCode: 'zone_houshan' });
    });
  });
});

/**
 * B1 修复的守门测试：「移动到另一个节点」**不得**把整块面板（画布 + 详情）卸载换成骨架屏。
 *
 * 根因：`enter` 曾经同步置面板级 `loading = true`，而 `AsyncBoundary` 的 `loading` 优先级最高
 * —— 点一下「前往」，画布瞬间消失，WS 慢或正在重连时这个白会一直持续（用户实测「白屏」）。
 */
describe('MapPanel · 点「前往」不卸载面板（B1 修复）', () => {
  const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });

  /** 只服务地图域：enter 成功体 + map.list 真值（当前所在 = 东门）。 */
  function mapHandler(onEnter?: () => Promise<void>): unknown {
    return async (request: { cmd: number; subCmd: number }) => {
      if (request.cmd !== MAP_CMD.cmd) return null;
      if (request.subCmd === MAP_CMD.list) {
        return ok({ maps: [makeMap(NODES, EDGES, { currentNodeCode: 'qy_gate_e' })], playerPower: 100 });
      }
      if (request.subCmd === MAP_CMD.enter) {
        if (onEnter !== undefined) await onEnter();
        return ok({
          node: { ...GATE_E, adjacent: false },
          playerPower: 100,
          threshold: 10,
          firstVisit: true,
        });
      }
      return null;
    };
  }

  function setupWith(handler: unknown): ReturnType<typeof createPanelHarness> {
    const harness = createPanelHarness({ handler: handler as never });
    harness.seed(() => {
      harness.root.map.maps = [makeMap(NODES, EDGES)];
      harness.root.map.nodes = NODES;
      harness.root.map.edges = EDGES;
      harness.root.map.selectedMapCode = 'map_qingyun';
      harness.root.map.playerPower = 100;
    });
    return harness;
  }

  it('enter 在飞时：画布与详情仍在 DOM，只有按钮 loading', async () => {
    let open: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      open = resolve;
    });
    const harness = setupWith(mapHandler(() => pending));
    harness.render(<MapPanel />);
    await harness.connect();

    const button = screen.getByTestId('map-node-enter-qy_gate_e');
    await userEvent.click(button);

    await waitFor(() => expect(button).toHaveClass('ant-btn-loading'));
    // 关键断言：面板没有被换成骨架屏，画布与详情都还在
    expect(screen.queryByTestId('async-boundary-loading')).toBeNull();
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('map-node-card-qy_gate_e')).toBeInTheDocument();

    open();
    await waitFor(() => expect(harness.root.map.moving).toBe(false));
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-loading')).toBeNull();
  });

  it('静默刷新失败：保留旧数据，不切骨架屏、不切错误页', async () => {
    // enter 成功、随后的 map.list 失败
    const handler = async (request: { cmd: number; subCmd: number }): Promise<unknown> => {
      if (request.cmd !== MAP_CMD.cmd) return null;
      if (request.subCmd === MAP_CMD.enter) {
        return ok({ node: { ...GATE_E, adjacent: false }, playerPower: 100, threshold: 10, firstVisit: true });
      }
      if (request.subCmd === MAP_CMD.list) return { errorCode: 500, errorMessage: '刷新失败' };
      return null;
    };
    const harness = setupWith(handler);
    harness.render(<MapPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('map-node-enter-qy_gate_e'));
    await waitFor(() => expect(harness.root.map.moving).toBe(false));

    expect(harness.root.map.nodes).toHaveLength(NODES.length);
    expect(harness.root.map.error).toBeNull();
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-loading')).toBeNull();
    expect(screen.queryByTestId('async-boundary-error')).toBeNull();
    expect(screen.getByTestId('map-node-card-qy_gate_e')).toBeInTheDocument();
  });
});
