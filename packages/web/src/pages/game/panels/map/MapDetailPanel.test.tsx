/**
 * MapDetailPanel 单测：详情容器只做「选中态 → 节点卡」，并把当前地图的对象按宿主过滤。
 *
 * 交互契约（§12.1）：**移动只走本面板里的按钮**（回调由容器给），本组件不读 store、不发请求。
 * 数据分层（T1）：小标题按 `level === null` 分流 —— 职能型枢纽不出现「难度参考」。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapNodeView, MapObjectView, NodeProgressView } from '@idle-path/ionet-transport';
import { MapDetailPanel } from './MapDetailPanel.js';

function progress(): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false };
}

/** 默认是**职能型枢纽**（百工院）：`level` / `threshold` 为 null。 */
function makeNode(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return {
    id: 1,
    code: 'qy_baigongyuan',
    name: '百工院',
    ring: 'inner',
    sector: 'S',
    kind: 'route',
    featureKey: 'alchemy',
    level: null,
    threshold: null,
    hasWaypoint: false,
    chapter: 2,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 15,
    gridRow: 15,
    gridCol: 10,
    description: null,
    adjacent: true,
    progress: progress(),
    ...overrides,
  } as MapNodeView;
}

function makeObject(overrides: Partial<MapObjectView> = {}): MapObjectView {
  return {
    id: 1,
    code: 'obj_x',
    nodeCode: 'qy_baigongyuan',
    kind: 'office',
    name: '某堂',
    featureKey: 'alchemy',
    description: null,
    orderIndex: 1,
    ...overrides,
  };
}

describe('MapDetailPanel · 按宿主过滤对象', () => {
  it('只把 nodeCode 命中的对象交给节点卡', () => {
    render(
      <MapDetailPanel
        node={makeNode()}
        playerPower={100}
        currentCode={null}
        objects={[
          makeObject({ code: 'obj_here', nodeCode: 'qy_baigongyuan', name: '丹霞院' }),
          makeObject({ code: 'obj_other', nodeCode: 'qy_summit', name: '执事堂' }),
        ]}
        onEnter={vi.fn()}
        onWaypoint={vi.fn()}
      />,
    );
    const host = screen.getByTestId('map-objects-qy_baigongyuan');
    expect(host).toHaveTextContent('丹霞院');
    expect(host).not.toHaveTextContent('执事堂');
  });

  it('objects 缺省 / 空数组：不崩，给出空态', () => {
    render(
      <MapDetailPanel
        node={makeNode()}
        playerPower={100}
        currentCode={null}
        onEnter={vi.fn()}
        onWaypoint={vi.fn()}
      />,
    );
    expect(screen.getByTestId('map-objects-empty-qy_baigongyuan')).toBeInTheDocument();
  });

  it('当前所在节点：选中态为 current（徽标与按钮文案）', () => {
    render(
      <MapDetailPanel
        node={makeNode()}
        playerPower={100}
        currentCode="qy_baigongyuan"
        onEnter={vi.fn()}
        onWaypoint={vi.fn()}
      />,
    );
    expect(screen.getByTestId('map-node-enter-qy_baigongyuan')).toHaveTextContent('当前所在');
  });
});

describe('MapDetailPanel · 小标题数据分层（T1）', () => {
  function renderPanel(node: MapNodeView): void {
    render(
      <MapDetailPanel
        node={node}
        playerPower={100}
        currentCode={null}
        onEnter={vi.fn()}
        onWaypoint={vi.fn()}
      />,
    );
  }

  it('职能型枢纽：小标题不含「难度参考」，卡片不含怪物境界', () => {
    renderPanel(makeNode());
    expect(document.body).not.toHaveTextContent('难度参考');
    expect(document.body).not.toHaveTextContent('怪物境界');
    expect(document.body).toHaveTextContent('传送点 / 职能入口');
  });

  it('秘境节点：小标题保留「难度参考」', () => {
    renderPanel(
      makeNode({
        code: 'qy_peak_xunlian',
        name: '第八峰·历练',
        kind: 'secret_realm',
        zoneCode: 'zone_houshan',
        level: 5,
        threshold: 75,
      }),
    );
    expect(document.body).toHaveTextContent('难度参考 / 传送点 / 职能入口');
    expect(document.body).toHaveTextContent('怪物境界');
  });
});
