/**
 * `map-lab` 测试夹具（**仅测试用**，放 `test/` 下不参与 src 门禁与覆盖率）。
 *
 * 与 `test/stores/map-store.test.ts` 里的内联构造同源；抽出来是因为本轮 map-lab 有 7 个
 * 测试文件都要造节点 / 对象，复制七份会让「协议字段变了要改哪」变成七处。
 */
import type { MapEdgeView, MapNodeView, MapObjectView, MapView, NodeProgressView } from '@idle-path/ionet-transport';

export function makeProgress(overrides: Partial<NodeProgressView> = {}): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false, ...overrides };
}

/** 一个「门」型节点（默认带传送点、相邻、坐标在东门）—— 大多数用例的基线。 */
export function makeNode(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return {
    id: 1,
    code: 'qy_gate_e',
    name: '东门',
    ring: 'outer',
    sector: 'E',
    kind: 'route',
    featureKey: null,
    level: null,
    threshold: null,
    hasWaypoint: true,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    gridRow: 10,
    gridCol: 20,
    description: '青石山门朝东。',
    adjacent: true,
    progress: makeProgress(),
    ...overrides,
  };
}

/** 一个职能对象（默认挂在东门，与 `map-objects.json` 同形）。 */
export function makeObject(overrides: Partial<MapObjectView> = {}): MapObjectView {
  return {
    id: 1,
    code: 'obj_cangjingge',
    nodeCode: 'qy_gate_e',
    kind: 'office',
    name: '藏经阁',
    featureKey: 'skill',
    description: '九层木阁，藏尽宗门功法与旧档。',
    orderIndex: 1,
    ...overrides,
  };
}

export function makeEdge(fromNodeCode: string, toNodeCode: string, bidirectional = true): MapEdgeView {
  return { fromNodeCode, toNodeCode, bidirectional };
}

/** 一张地图（默认 21×21 青云宗，与种子同形）。 */
export function makeMap(
  nodes: MapNodeView[],
  edges: MapEdgeView[] = [],
  overrides: Partial<MapView> = {},
): MapView {
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
