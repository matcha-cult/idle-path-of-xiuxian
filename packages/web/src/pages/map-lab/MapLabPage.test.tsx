/**
 * `MapLabPage` 集成测试 —— 本轮任务的**核心链路**端到端：
 * 「进入地图 → 看到可交互对象 → 与传送点交互 → 解锁传送与移动」。
 *
 * ## 为什么这条链路必须"走一圈"才能测
 * 「传送**到**某地」的前提是**人不在那里**；而「与传送点交互」的前提是**人在那里**。
 * 所以完整链路必然是：**走到 A → 在 A 交互点亮 → 走开 → 再传送回 A**。
 * （第一版测试把这两件事写在同一个场景里，逻辑上自相矛盾 —— 已按真实链路重写。）
 *
 * 断言的是**玩家可见的因果 + 协议级证据**，不是内部状态：
 * 1. 首次进入：南门与北门不相邻 → 右栏「暂不可前往」禁用，并说明「需先交互」；
 * 2. 人不在南门 → **不给**交互按钮（防隔空点亮）；
 * 3. 沿线路走到南门（相邻移动，两次 `map.enter`）→ 出现「与传送点交互」；
 * 4. 点交互 → 状态变「已点亮」，清单里那条也跟着变；
 * 5. 走回中转站 → 再看南门：按钮变「传送至此」且可点；
 * 6. 点它 → **真的发出 `MAP_CMD.waypoint`**。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_CMD } from '@idle-path/ionet-transport';
import type { MapNodeView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../test/helpers/panel-harness.js';
import { makeEdge, makeMap, makeNode, makeObject } from '../../../test/helpers/map-lab-fixtures.js';
import { MapLabPage } from './MapLabPage.js';

// 每个用例前重建：`afterEach` 会 restoreAllMocks，放 beforeAll 会在第一个用例后失效
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 660,
    bottom: 660,
    width: 660,
    height: 660,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 线路：北门 —— 中转站 —— 南门；后山另挂在北门上（用于秘境石台那条用例）。 */
const NODES: MapNodeView[] = [
  makeNode({ id: 1, code: 'qy_gate_n', name: '北门', gridRow: 0, gridCol: 10 }),
  makeNode({ id: 2, code: 'qy_mid', name: '中转站', hasWaypoint: false, gridRow: 10, gridCol: 10 }),
  makeNode({
    id: 3,
    code: 'qy_gate_s',
    name: '南门',
    hasWaypoint: true,
    gridRow: 20,
    gridCol: 10,
    // 服务端「首次到达即点亮」已经为真 —— 新链路**仍然**要求交互（这正是本轮要验证的）
    progress: { visited: true, waypointUnlocked: true, idleUnlocked: false, cleared: false },
  }),
  makeNode({
    id: 4,
    code: 'qy_houshan',
    name: '第八峰·后山',
    hasWaypoint: false,
    featureKey: 'realm',
    gridRow: 5,
    gridCol: 5,
  }),
];
const EDGES = [makeEdge('qy_gate_n', 'qy_mid'), makeEdge('qy_mid', 'qy_gate_s'), makeEdge('qy_gate_n', 'qy_houshan')];
const OBJECTS = [makeObject({ code: 'obj_cangjingge', nodeCode: 'qy_gate_n', name: '藏经阁' })];

/** 服务端口径：`adjacent` 是**相对当前所在**算出来的，会随移动变化。 */
function nodesAt(current: string): MapNodeView[] {
  const neighbors = new Set<string>();
  for (const edge of EDGES) {
    if (edge.fromNodeCode === current) neighbors.add(edge.toNodeCode);
    if (edge.toNodeCode === current) neighbors.add(edge.fromNodeCode);
  }
  return NODES.map((node) => ({ ...node, adjacent: node.code !== current && neighbors.has(node.code) }));
}

const ok = (data: unknown): { data: unknown } => ({ data: { success: true, message: 'ok', data } });

interface World {
  current: string;
  waypointed: string[];
  entered: string[];
}

/** 只服务地图域：`list` 按当前所在算 adjacent，`enter`/`waypoint` 改变当前所在。 */
function mapHandler(world: World): unknown {
  const mapData = (): unknown => ({
    maps: [makeMap(nodesAt(world.current), EDGES, { currentNodeCode: world.current, objects: OBJECTS })],
    playerPower: 100,
  });
  return async (request: { cmd: number; subCmd: number; data?: unknown }) => {
    if (request.cmd !== MAP_CMD.cmd) return null;
    const nodeCode = (request.data as { nodeCode?: string } | undefined)?.nodeCode ?? '';
    if (request.subCmd === MAP_CMD.list) return ok(mapData());
    if (request.subCmd === MAP_CMD.enter) {
      world.entered.push(nodeCode);
      world.current = nodeCode;
      const node = nodesAt(nodeCode).find((entry) => entry.code === nodeCode);
      return ok({ node, playerPower: 100, threshold: null, firstVisit: true });
    }
    if (request.subCmd === MAP_CMD.waypoint) {
      world.waypointed.push(nodeCode);
      world.current = nodeCode;
      const node = nodesAt(nodeCode).find((entry) => entry.code === nodeCode);
      return ok({ node });
    }
    return null;
  };
}

function setup(current = 'qy_gate_n') {
  const world: World = { current, waypointed: [], entered: [] };
  const harness = createPanelHarness({ handler: mapHandler(world) as never });
  harness.seed(() => {
    harness.root.map.maps = [makeMap(nodesAt(current), EDGES, { currentNodeCode: current, objects: OBJECTS })];
    harness.root.map.nodes = nodesAt(current);
    harness.root.map.edges = EDGES;
    harness.root.map.selectedMapCode = 'map_qingyun';
    harness.root.map.currentCode = current;
    harness.root.map.playerPower = 100;
  });
  return { harness, world };
}

async function renderPage(harness: ReturnType<typeof setup>['harness']) {
  harness.render(<MapLabPage />);
  await harness.connect();
  await waitFor(() => expect(screen.getByTestId('map-lab-object-list')).toBeInTheDocument());
}

/** 点对象面板里某条对象，把画布焦点移到它的宿主枢纽。 */
async function focusNode(objectKey: string): Promise<void> {
  await userEvent.click(screen.getByTestId(`map-lab-object-focus-${objectKey}`));
}

/**
 * 点画布枢纽：用**裸事件**派发 pointerdown/pointerup。
 * 不用 `userEvent.click` —— 它在 `pointerdown` 被 `preventDefault`（拖动抑制的第一行）之后
 * 会收敛后续事件，枢纽根本收不到 pointerup（本测试第一版就栽在这里）。
 * 落点每次微移一点，避免两次快速点到同一 key 被当成「双击直达」而意外移动。
 */
let tapSeq = 0;
function tapPin(code: string): void {
  const pin = screen.getByTestId(`canvas-graph-item-${code}`);
  tapSeq += 1;
  for (const type of ['pointerdown', 'pointerup'] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 5 + tapSeq,
      clientY: 5,
    });
    fireEvent(pin, event);
  }
}

/** 走一步：点「前往此地」并等当前所在真的变过去。 */
async function walkTo(harness: ReturnType<typeof setup>['harness'], code: string): Promise<void> {
  await userEvent.click(within(screen.getByTestId('map-lab-travel-card')).getByTestId('map-lab-travel-action'));
  await waitFor(() => expect(harness.root.map.currentCode).toBe(code));
}

describe('首屏：进入地图 → 看到可交互对象', () => {
  it('常驻说明 + 画布 + 可交互对象清单（三类都在）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    expect(screen.getByTestId('map-lab-notice')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-graph')).toBeInTheDocument();
    const panel = screen.getByTestId('map-lab-object-list').parentElement;
    // 传送点 2（北门 / 南门）· 秘境入口 1（后山）· 职能入口 1（藏经阁）
    expect(panel).toHaveTextContent('传送点 2');
    expect(panel).toHaveTextContent('秘境入口 1');
    expect(panel).toHaveTextContent('职能入口 1');
  });

  it('未点亮的传送点**不带**「已点亮」标记（清单里不虚报）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    expect(screen.getByTestId('map-lab-object-wp:qy_gate_s')).toHaveTextContent('南门传送点');
    expect(screen.queryByTestId('map-lab-object-done-wp:qy_gate_s')).toBeNull();
  });

  it('默认选中当前所在节点（北门），并标出「此处」', async () => {
    const { harness } = setup();
    await renderPage(harness);
    expect(screen.getByTestId('map-lab-object-here-wp:qy_gate_n')).toBeInTheDocument();
  });

  it('概览里的传送点数初始为 0（读的是本会话交互结果，不是服务端已达）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    const overview = screen.getByTestId('map-overview');
    expect(overview).toHaveTextContent('已点亮传送点');
    expect(overview).toHaveTextContent('0');
  });
});

describe('⭐ 核心链路：走到 A → 交互 → 走开 → 传送回 A', () => {
  it('① 未交互时南门「暂不可前往」禁用，且说明需先交互', async () => {
    const { harness } = setup();
    await renderPage(harness);
    await focusNode('wp:qy_gate_s');
    const card = screen.getByTestId('map-lab-travel-card');
    expect(card).toHaveAttribute('data-kind', 'blocked');
    expect(within(card).getByTestId('map-lab-travel-action')).toBeDisabled();
    expect(card).toHaveTextContent('需先在此地与传送点交互');
  });

  it('② 人不在南门 → 不给交互按钮（防隔空点亮传送点）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    await focusNode('wp:qy_gate_s');
    expect(screen.getByTestId('map-lab-waypoint-card')).toHaveAttribute('data-state', 'elsewhere');
    expect(screen.queryByTestId('map-lab-waypoint-interact')).toBeNull();
  });

  it('③④⑤⑥ 完整链路：两次相邻移动 → 交互点亮 → 走开 → 传送并发出 map.waypoint', async () => {
    const { harness, world } = setup('qy_gate_n');
    await renderPage(harness);

    // ③ 沿线路走到南门：北门 → 中转站 → 南门（每一步都是相邻移动，走 MAP_CMD.enter）
    await focusNode('obj_cangjingge'); // 只是移焦点，不移动
    await focusNode('wp:qy_gate_s');
    expect(screen.getByTestId('map-lab-travel-card')).toHaveAttribute('data-kind', 'blocked');

    await focusNode('wp:qy_gate_n');
    // 北门 → 中转站
    await userEvent.click(screen.getByTestId('map-lab-object-focus-wp:qy_gate_n'));
    expect(screen.getByTestId('map-lab-travel-card')).toHaveAttribute('data-kind', 'here');
    tapPin('qy_mid');
    await walkTo(harness, 'qy_mid');

    // 中转站 → 南门（此刻南门相邻）
    await focusNode('wp:qy_gate_s');
    expect(screen.getByTestId('map-lab-travel-card')).toHaveAttribute('data-kind', 'walk');
    await walkTo(harness, 'qy_gate_s');
    expect(world.entered).toEqual(['qy_mid', 'qy_gate_s']);

    // ④ 人在南门 → 出现交互按钮 → 点亮
    expect(screen.getByTestId('map-lab-waypoint-card')).toHaveAttribute('data-state', 'ready');
    await userEvent.click(screen.getByTestId('map-lab-waypoint-interact'));
    expect(screen.getByTestId('map-lab-waypoint-done')).toHaveTextContent('已点亮');
    expect(screen.getByTestId('map-lab-object-done-wp:qy_gate_s')).toHaveTextContent('已点亮');

    // ⑤ 走开：南门 → 中转站 → 北门。
    // 必须走回**不与自己相邻**的地点，传送才有意义（中转站仍与南门相邻，那里只会给「前往此地」）
    tapPin('qy_mid');
    await walkTo(harness, 'qy_mid');
    tapPin('qy_gate_n');
    await walkTo(harness, 'qy_gate_n');
    expect(world.entered).toEqual(['qy_mid', 'qy_gate_s', 'qy_mid', 'qy_gate_n']);

    // ⑥ 从北门看南门：不相邻 + 传送点已点亮 → 可传送 → 点击 → 真的发请求
    await focusNode('wp:qy_gate_s');
    const card = screen.getByTestId('map-lab-travel-card');
    expect(card).toHaveAttribute('data-kind', 'teleport');
    const action = within(card).getByTestId('map-lab-travel-action');
    expect(action).toHaveTextContent('传送至此');
    expect(action).toBeEnabled();
    await userEvent.click(action);
    await waitFor(() => expect(world.waypointed).toEqual(['qy_gate_s']));
    await waitFor(() => expect(harness.root.map.currentCode).toBe('qy_gate_s'));
    expect(
      harness.requests.some((request) => request.cmd === MAP_CMD.cmd && request.subCmd === MAP_CMD.waypoint),
    ).toBe(true);
  });

  it('⭐ 即便服务端已 waypointUnlocked，未交互时按钮仍是禁用的（机制不被绕过）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    // 夹具里南门的 progress.waypointUnlocked = true
    expect(harness.root.map.nodes.find((node) => node.code === 'qy_gate_s')?.progress.waypointUnlocked).toBe(true);
    await focusNode('wp:qy_gate_s');
    expect(within(screen.getByTestId('map-lab-travel-card')).getByTestId('map-lab-travel-action')).toBeDisabled();
  });
});

describe('旧契约不被破坏', () => {
  it('画布上点击枢纽**只选中**，不发任何移动请求（§12.1）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    const before = harness.requests.length;
    tapPin('qy_houshan');
    expect(harness.requests.length).toBe(before);
    // 但选中态确实变了（「只选中」不等于「没反应」）：焦点移到后山
    expect(screen.queryByTestId('map-lab-object-here-obj_cangjingge')).toBeNull();
    expect(screen.getByTestId('map-lab-object-here-realm:qy_houshan')).toBeInTheDocument();
  });

  it('底部常驻提示条在（「点击只选中」这条反直觉规则必须常驻教）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    expect(screen.getByTestId('map-hint-bar')).toHaveTextContent('点击枢纽查看详情');
  });

  it('秘境入口所在节点仍挂出秘境石台（复用既有交互区，未改一行）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    await focusNode('realm:qy_houshan');
    expect(screen.getByTestId('realm-stone-section')).toBeInTheDocument();
  });

  it('主题切换入口在（本页不在游戏外壳之下，必须自带）', async () => {
    const { harness } = setup();
    await renderPage(harness);
    expect(screen.getByTestId('theme-float-button')).toBeInTheDocument();
  });
});
