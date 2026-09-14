/**
 * `MapLabPage` **真实种子**前置验证 —— 用 `packages/server/prisma/seeds/game/*.json` 的真数据
 * （17 节点 / 32 边 / 12 对象 / 21×21 交叉线）渲染整页。
 *
 * 为什么单独一个文件：其余用例都用 3~4 个手造节点（跑得快、意图清楚），但真机验收要面对的是
 * **真实体量**。这一条专门抓「假数据看不出来」的问题：
 * - 节点坐标是否都落在声明的坐标空间内（越界会被画布静默丢弃 ⇒ 真机少点）；
 * - 真实体量下有没有重复 key / React 告警 / antd 弃用告警；
 * - 右栏三类对象的真实计数（4 传送点 + 1 秘境入口 + 12 职能入口）。
 *
 * 它**不能**替代真机（jsdom 没有真实布局与 canvas），但能在你打开浏览器之前把数据级问题挡掉。
 */
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_CMD } from '@idle-path/ionet-transport';
import type { MapEdgeView, MapNodeView, MapObjectView, MapView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../test/helpers/panel-harness.js';
import { MapLabPage } from './MapLabPage.js';
// 真实种子（与 init-game-db.mjs 灌进库的是同一批文件）
import edgesSeed from '../../../../server/prisma/seeds/game/map-edges.json';
import mapSeed from '../../../../server/prisma/seeds/game/maps.json';
import nodesSeed from '../../../../server/prisma/seeds/game/map-nodes.json';
import objectsSeed from '../../../../server/prisma/seeds/game/map-objects.json';

interface SeedNode {
  code: string;
  name: string;
  ring: string;
  sector: string | null;
  kind: string;
  featureKey: string | null;
  level: number | null;
  threshold: number | null;
  hasWaypoint: boolean;
  chapter: number;
  requiresNodeCode: string | null;
  zoneCode: string | null;
  orderIndex: number;
  gridRow: number;
  gridCol: number;
  description: string | null;
}
interface SeedEdge {
  fromNodeCode: string;
  toNodeCode: string;
  bidirectional: boolean;
}
interface SeedObject {
  code: string;
  nodeCode: string;
  kind: string;
  name: string;
  featureKey: string | null;
  description: string | null;
  orderIndex: number;
}

const NODES = nodesSeed as unknown as SeedNode[];
const EDGES = edgesSeed as unknown as SeedEdge[];
const OBJECTS = objectsSeed as unknown as SeedObject[];
const MAP = (mapSeed as unknown as { code: string; name: string; gridRows: number; gridCols: number }[])[0]!;

/** 起点：北门（种子里的四个传送门之一）。 */
const START = 'qy_gate_n';

/** 服务端口径：`adjacent` 相对当前所在从边表算出来。 */
function toDto(current: string): { nodes: MapNodeView[]; edges: MapEdgeView[]; objects: MapObjectView[] } {
  const neighbors = new Set<string>();
  for (const edge of EDGES) {
    if (edge.fromNodeCode === current) neighbors.add(edge.toNodeCode);
    if (edge.toNodeCode === current) neighbors.add(edge.fromNodeCode);
  }
  return {
    nodes: NODES.map((node, index) => ({
      id: index + 1,
      ...node,
      adjacent: node.code !== current && neighbors.has(node.code),
      progress: { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false },
    })),
    edges: EDGES.map((edge) => ({ ...edge })),
    objects: OBJECTS.map((object, index) => ({ id: index + 1, ...object })),
  };
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 900,
    bottom: 700,
    width: 900,
    height: 700,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function setup() {
  const { nodes, edges, objects } = toDto(START);
  const mapView: MapView = {
    id: 1,
    code: MAP.code,
    name: MAP.name,
    world: 'world_qingyun',
    orderIndex: 1,
    chapterFrom: 1,
    chapterTo: 2,
    requiresMapCode: null,
    description: null,
    gridRows: MAP.gridRows,
    gridCols: MAP.gridCols,
    backgroundKey: null,
    currentNodeCode: START,
    objects,
    nodes,
    edges,
  };
  const ok = (data: unknown): { data: unknown } => ({ data: { success: true, message: 'ok', data } });
  const harness = createPanelHarness({
    handler: (async (request: { cmd: number; subCmd: number }) => {
      if (request.cmd !== MAP_CMD.cmd) return null;
      if (request.subCmd === MAP_CMD.list) return ok({ maps: [mapView], playerPower: 100 });
      return null;
    }) as never,
  });
  harness.seed(() => {
    harness.root.map.maps = [mapView];
    harness.root.map.nodes = nodes;
    harness.root.map.edges = edges;
    harness.root.map.selectedMapCode = MAP.code;
    harness.root.map.currentCode = START;
    harness.root.map.playerPower = 100;
  });
  return harness;
}

describe('真实种子 · 数据面', () => {
  it('种子体量与文档一致（17 节点 / 32 边 / 12 对象 / 20×20 坐标空间）', () => {
    expect(NODES).toHaveLength(17);
    expect(EDGES).toHaveLength(32);
    expect(OBJECTS).toHaveLength(12);
    expect(MAP.gridRows).toBe(20);
    expect(MAP.gridCols).toBe(20);
  });

  it('所有节点坐标都落在声明的坐标空间内（越界点会被画布静默丢弃 ⇒ 真机少点）', () => {
    const offGrid = NODES.filter(
      (node) =>
        !Number.isInteger(node.gridRow) ||
        !Number.isInteger(node.gridCol) ||
        node.gridRow < 0 ||
        node.gridCol < 0 ||
        node.gridRow > MAP.gridRows ||
        node.gridCol > MAP.gridCols,
    ).map((node) => node.code);
    expect(offGrid).toEqual([]);
  });

  it('每个边表端点都能在节点表里解析到（悬挂边会被画布丢弃 ⇒ 真机少线）', () => {
    const known = new Set(NODES.map((node) => node.code));
    const dangling = EDGES.filter((edge) => !known.has(edge.fromNodeCode) || !known.has(edge.toNodeCode));
    expect(dangling).toEqual([]);
  });

  it('每个职能对象的宿主节点都存在', () => {
    const known = new Set(NODES.map((node) => node.code));
    expect(OBJECTS.filter((object) => !known.has(object.nodeCode))).toEqual([]);
  });
});

describe('真实种子 · 整页渲染（假数据看不出来的问题）', () => {
  it('⭐ 全量渲染无任何 console 告警（重复 key / antd 弃用 / act 警告都会在这里露头）', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const harness = setup();
    harness.render(<MapLabPage />);
    await harness.connect();
    await waitFor(() => expect(screen.getByTestId('map-lab-object-list')).toBeInTheDocument());
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([]);
    expect(warns.mock.calls.map((call) => String(call[0]))).toEqual([]);
  });

  it('17 个枢纽全部上画布（越界 / 非法坐标会让某个点静默消失）', async () => {
    const harness = setup();
    harness.render(<MapLabPage />);
    await harness.connect();
    await waitFor(() => expect(screen.getByTestId('canvas-graph')).toBeInTheDocument());
    for (const node of NODES) {
      expect(screen.getByTestId(`canvas-graph-item-${node.code}`)).toBeInTheDocument();
    }
    // 没有「缺少有效坐标」的降级提示
    expect(screen.queryByTestId('map-lab-canvas-off-grid')).toBeNull();
  });

  it('⭐ 右栏计数不重复：传送点 4 · 秘境入口 1 · 职能入口 11（合计 16 = 12 对象 + 4 派生传送点）', async () => {
    const harness = setup();
    harness.render(<MapLabPage />);
    await harness.connect();
    await waitFor(() => expect(screen.getByTestId('map-lab-object-list')).toBeInTheDocument());
    const panel = screen.getByTestId('map-lab-object-list').parentElement;
    expect(panel).toHaveTextContent('传送点 4');
    expect(panel).toHaveTextContent('秘境入口 1');
    expect(panel).toHaveTextContent('职能入口 11');
    // 每一行一个「移焦点」按钮 ⇒ 16 行
    expect(screen.getAllByTestId(/^map-lab-object-focus-/)).toHaveLength(16);
  });

  it('⭐ 秘境石台在右栏**只出现一次**（种子对象与节点派生行不得重复同一件事）', async () => {
    const harness = setup();
    harness.render(<MapLabPage />);
    await harness.connect();
    await waitFor(() => expect(screen.getByTestId('map-lab-object-list')).toBeInTheDocument());
    // 服务端对象 obj_mijing_shitai 覆盖了该节点的 realm 派生行
    expect(screen.getByTestId('map-lab-object-focus-obj_mijing_shitai')).toBeInTheDocument();
    expect(screen.queryByTestId('map-lab-object-focus-realm:qy_peak_xunlian')).toBeNull();
    expect(screen.getAllByText('秘境石台')).toHaveLength(1);
  });

  it('起点北门的传送点可交互（ready），另三个门在未交互时都不可传送', async () => {
    const harness = setup();
    harness.render(<MapLabPage />);
    await harness.connect();
    await waitFor(() => expect(screen.getByTestId('map-lab-waypoint-card')).toBeInTheDocument());
    expect(screen.getByTestId('map-lab-waypoint-card')).toHaveAttribute('data-state', 'ready');

    for (const code of ['qy_gate_e', 'qy_gate_s', 'qy_gate_w']) {
      expect(screen.getByTestId(`canvas-graph-item-${code}`)).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('人在北门时只有相邻节点可走：画布上可点数 = 相邻数 + 自己', async () => {
    const harness = setup();
    harness.render(<MapLabPage />);
    await harness.connect();
    await waitFor(() => expect(screen.getByTestId('canvas-graph')).toBeInTheDocument());
    const { nodes } = toDto(START);
    const adjacent = nodes.filter((node) => node.adjacent).length;
    const reachable = nodes.filter((node) => node.code === START || node.adjacent).length;
    expect(adjacent).toBeGreaterThan(0);
    expect(reachable).toBe(adjacent + 1);
    // 可达的点不该被画成暗色
    for (const node of nodes.filter((entry) => entry.code === START || entry.adjacent)) {
      expect(screen.getByTestId(`canvas-graph-item-${node.code}`)).not.toHaveAttribute('aria-disabled');
    }
  });

  it('秘境石台（种子里是 realm 对象）能起出秘境石台交互区', async () => {
    const realmNode = NODES.find((node) => node.featureKey === 'realm');
    expect(realmNode).toBeDefined();
    const harness = setup();
    harness.render(<MapLabPage />);
    await harness.connect();
    await waitFor(() => expect(screen.getByTestId('map-lab-object-list')).toBeInTheDocument());
    await waitFor(() =>
      expect(
        screen.getByTestId(`map-lab-object-focus-obj_mijing_shitai`),
      ).toBeInTheDocument(),
    );
    const focus = screen.getByTestId(`map-lab-object-focus-obj_mijing_shitai`);
    focus.click();
    await waitFor(() => expect(screen.getByTestId('realm-stone-section')).toBeInTheDocument());
    expect(within(screen.getByTestId('realm-stone-section')).getByText('秘境石台')).toBeInTheDocument();
  });
});
