/**
 * MapDetailPanel 单测：详情容器只做「选中态 → 节点卡」，并把当前地图的对象按宿主过滤。
 *
 * 交互契约（§12.1）：**移动只走本面板里的按钮**（回调由容器给），本组件不读 store、不发请求。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapNodeView, MapObjectView, NodeProgressView } from '@idle-path/ionet-transport';
import { MapDetailPanel } from './MapDetailPanel.js';

function progress(): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false };
}

function makeNode(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return {
    id: 1,
    code: 'qy_baigongyuan',
    name: '百工院',
    ring: 'inner',
    sector: 'S',
    kind: 'route',
    featureKey: 'alchemy',
    level: 5,
    threshold: 75,
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
