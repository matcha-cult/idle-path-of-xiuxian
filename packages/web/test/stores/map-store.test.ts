/**
 * `MapStore` 的移动 / 刷新口径（用户实测 B1：点「前往」不该把面板换成骨架屏）。
 *
 * 三条必须钉死的口径：
 * 1. `loading` **只**服务于首屏 / 整图加载（`load()`）；`refreshQuiet()` 全程不碰它；
 * 2. `enter` / `waypoint` 走静默刷新，失败**保留旧数据**、不写 `error`（不把线路图换成错误页）；
 * 3. 移动中的反馈是**按钮级** `moving` / `movingTo`，结束后复位。
 */
import { describe, expect, it } from 'vitest';
import {
  MAP_CMD,
  type MapEdgeView,
  type MapNodeView,
  type MapObjectView,
  type MapView,
  type NodeProgressView,
} from '@idle-path/ionet-transport';
import type { MockHandler, MockRequest } from '@idle-path/ionet-transport/testing';
import { createPanelHarness } from '../helpers/panel-harness.js';

type Req = MockRequest;
const ok = (data: unknown): { data: unknown } => ({ data: { success: true, message: 'ok', data } });

function progress(overrides: Partial<NodeProgressView> = {}): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false, ...overrides };
}

function makeNode(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return {
    id: 1,
    code: 'qy_gate_e',
    name: '东门',
    ring: 'outer',
    sector: 'E',
    kind: 'route',
    featureKey: null,
    level: 1,
    threshold: 10,
    hasWaypoint: true,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    gridRow: 10,
    gridCol: 20,
    description: '青石山门朝东。',
    adjacent: true,
    progress: progress(),
    ...overrides,
  };
}

function makeMap(nodes: MapNodeView[], edges: MapEdgeView[] = []): MapView {
  const objects: MapObjectView[] = [];
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
    gridRows: 20,
    gridCols: 20,
    backgroundKey: null,
    currentNodeCode: null,
    objects,
    nodes,
    edges,
  };
}

const GATE_E = makeNode();
const APPROACH = makeNode({ id: 2, code: 'qy_approach', name: '外门接引区', ring: 'approach', adjacent: true });
const NODES = [GATE_E, APPROACH];

/** 只回地图域的成功体。 */
function mapHandler(overrides: Partial<Record<'list' | 'enter' | 'waypoint', MockHandler>> = {}): MockHandler {
  return async (request: Req) => {
    if (request.cmd !== MAP_CMD.cmd) return null;
    if (request.subCmd === MAP_CMD.list) {
      const handler = overrides.list;
      return handler === undefined ? ok({ maps: [makeMap(NODES)], playerPower: 45 }) : handler(request);
    }
    if (request.subCmd === MAP_CMD.enter) {
      const handler = overrides.enter;
      if (handler !== undefined) return handler(request);
      return ok({ node: GATE_E, playerPower: 45, threshold: 10, firstVisit: true });
    }
    if (request.subCmd === MAP_CMD.waypoint) {
      const handler = overrides.waypoint;
      if (handler !== undefined) return handler(request);
      return ok({ node: GATE_E, playerPower: 45 });
    }
    return null;
  };
}

function setup(handler: MockHandler = mapHandler()) {
  const harness = createPanelHarness({ handler });
  harness.seed(() => {
    harness.root.map.maps = [makeMap(NODES)];
    harness.root.map.nodes = NODES;
    harness.root.map.edges = [];
    harness.root.map.selectedMapCode = 'map_qingyun';
    harness.root.map.playerPower = 45;
  });
  return harness;
}

/** 一个可手动放行的 Promise（控制请求在飞的时间窗）。 */
function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe('MapStore · load 仍走面板级 loading（首屏骨架屏别改掉）', () => {
  it('load 期间 loading=true，结束后复位', async () => {
    const harness = setup();
    await harness.connect();
    const pending = harness.root.map.load();
    expect(harness.root.map.loading).toBe(true);
    await pending;
    expect(harness.root.map.loading).toBe(false);
    expect(harness.root.map.nodes).toHaveLength(2);
  });
});

describe('MapStore · refreshQuiet 是静默刷新', () => {
  it('成功：替换数据，且全程不碰 loading / error', async () => {
    const newer = makeMap([GATE_E], []);
    newer.currentNodeCode = 'qy_gate_e';
    const bare = createPanelHarness({ handler: mapHandler({ list: () => ok({ maps: [newer], playerPower: 99 }) }) });
    bare.seed(() => {
      bare.root.map.maps = [makeMap(NODES)];
      bare.root.map.nodes = NODES;
      bare.root.map.selectedMapCode = 'map_qingyun';
    });
    await bare.connect();

    const pending = bare.root.map.refreshQuiet();
    expect(bare.root.map.loading).toBe(false);
    await pending;
    expect(bare.root.map.loading).toBe(false);
    expect(bare.root.map.playerPower).toBe(99);
    expect(bare.root.map.nodes).toHaveLength(1);
    expect(bare.root.map.error).toBeNull();
  });

  it('失败：保留旧数据、不写 error、不置 loading（只 toast）', async () => {
    const harness = setup(
      mapHandler({ list: () => ({ errorCode: 500, errorMessage: '服务端炸了' }) }),
    );
    await harness.connect();
    const before = harness.root.map.nodes;

    await harness.root.map.refreshQuiet();

    expect(harness.root.map.nodes).toBe(before);
    expect(harness.root.map.nodes).toHaveLength(2);
    expect(harness.root.map.loading).toBe(false);
    expect(harness.root.map.error).toBeNull();
    expect(harness.root.toast.toasts.length).toBeGreaterThan(0);
  });
});

/** 服务端真值：当前所在 = 东门（`enter` 后的 `map.list` 会这样回）。 */
function listAtGate(): MockHandler {
  return () => {
    const map = makeMap(NODES);
    map.currentNodeCode = 'qy_gate_e';
    return ok({ maps: [map], playerPower: 45 });
  };
}

describe('MapStore · enter / waypoint 走静默刷新（B1 修复）', () => {
  it('enter 全程 loading=false（不闪骨架屏），moving/movingTo 在飞时为真', async () => {
    const enterGate = gate();
    const harness = setup(
      mapHandler({
        list: listAtGate(),
        enter: async () => {
          await enterGate.promise;
          return ok({ node: GATE_E, playerPower: 45, threshold: 10, firstVisit: true });
        },
      }),
    );
    await harness.connect();

    const pending = harness.root.map.enter('qy_gate_e');
    expect(harness.root.map.loading).toBe(false);
    expect(harness.root.map.moving).toBe(true);
    expect(harness.root.map.movingTo).toBe('qy_gate_e');
    expect(harness.root.map.error).toBeNull();

    enterGate.open();
    await pending;
    expect(harness.root.map.loading).toBe(false);
    expect(harness.root.map.moving).toBe(false);
    expect(harness.root.map.movingTo).toBeNull();
    expect(harness.root.map.currentCode).toBe('qy_gate_e');
  });

  it('enter 传输失败：只 toast，不写 error、不清空线路图', async () => {
    const harness = setup(
      mapHandler({ enter: () => ({ errorCode: 500, errorMessage: '跑图超时' }) }),
    );
    await harness.connect();
    const before = harness.root.map.nodes;

    await harness.root.map.enter('qy_gate_e');

    expect(harness.root.map.error).toBeNull();
    expect(harness.root.map.nodes).toBe(before);
    expect(harness.root.map.moving).toBe(false);
    expect(harness.root.toast.toasts.length).toBeGreaterThan(0);
  });

  it('waypoint 全程 loading=false，moving 复位', async () => {
    const harness = setup(mapHandler({ list: listAtGate() }));
    await harness.connect();
    await harness.root.map.waypoint('qy_gate_e');
    expect(harness.root.map.loading).toBe(false);
    expect(harness.root.map.moving).toBe(false);
    expect(harness.root.map.currentCode).toBe('qy_gate_e');
  });
});
