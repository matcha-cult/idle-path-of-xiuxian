/**
 * MapNodeCard 单测：门槛对比（恰好等于 = 可进入）/ 三态徽标 / 未开放系统禁用入口 /
 * **灵田药园（未实现 + 挂机点）仍可作为挂机目标** / 动作回调 / 协议字段不上屏。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import { UNIMPLEMENTED_FEATURES } from './feature-registry.js';
import { MapNodeCard } from './MapNodeCard.js';

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
    level: 5,
    threshold: 95,
    hasWaypoint: false,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    progress: progress(),
    ...overrides,
  } as MapNodeView;
}

function setup(node: MapNodeView, playerPower: number, current = false) {
  const onEnter = vi.fn();
  const onWaypoint = vi.fn();
  render(<MapNodeCard node={node} playerPower={playerPower} current={current} onEnter={onEnter} onWaypoint={onWaypoint} />);
  return { onEnter, onWaypoint };
}

describe('MapNodeCard · 战力门槛对比（§6.1 是 ≥）', () => {
  it('恰好等于门槛 = 可以进入，且按钮可用', () => {
    setup(makeNode({ code: 'n_eq', threshold: 95 }), 95);
    expect(screen.getByTestId('map-node-compare-n_eq')).toHaveTextContent('可以进入');
    expect(screen.getByTestId('map-node-enter-n_eq')).toBeEnabled();
  });

  it('差 1 = 战力不足，按钮禁用并给出差额', () => {
    setup(makeNode({ code: 'n_low', threshold: 95 }), 94);
    const compare = screen.getByTestId('map-node-compare-n_low');
    expect(compare).toHaveTextContent('战力不足');
    expect(compare).toHaveTextContent('差 1');
    expect(screen.getByTestId('map-node-enter-n_low')).toBeDisabled();
  });

  it('超出门槛 = 可以进入', () => {
    setup(makeNode({ code: 'n_hi', threshold: 95 }), 120);
    expect(screen.getByTestId('map-node-compare-n_hi')).toHaveTextContent('可以进入');
  });
});

describe('MapNodeCard · 三态徽标', () => {
  it('已到达 + 传送点 + 离线挂机三态都渲染', () => {
    setup(
      makeNode({
        code: 'n_badge',
        progress: progress({ visited: true, waypointUnlocked: true, idleUnlocked: true }),
      }),
      200,
    );
    expect(screen.getByTestId('map-node-badge-visited')).toHaveTextContent('已到达');
    expect(screen.getByTestId('map-node-badge-waypoint')).toHaveTextContent('传送点已点亮');
    expect(screen.getByTestId('map-node-badge-idle')).toHaveTextContent('离线挂机已解锁');
  });

  it('未到达时只显示未到达', () => {
    setup(makeNode({ code: 'n_new' }), 200);
    expect(screen.getByTestId('map-node-badge-visited')).toHaveTextContent('未到达');
    expect(screen.queryByTestId('map-node-badge-waypoint')).toBeNull();
  });
});

describe('MapNodeCard · 承载系统与 FeatureGate', () => {
  it.each([...UNIMPLEMENTED_FEATURES])('未实现系统 %s：渲染「未开放」并禁用系统入口', (featureKey) => {
    setup(makeNode({ code: 'n_gate', featureKey }), 999);
    const gate = screen.getByTestId('feature-gate');
    expect(gate).toHaveTextContent('未开放');
    expect(screen.getByTestId('map-node-feature-entry-n_gate')).toBeDisabled();
    expect(screen.queryByTestId('map-node-feature-open-n_gate')).toBeNull();
  });

  it('已实现系统（功法）显示「已开放」且没有未开放门', () => {
    setup(makeNode({ code: 'n_open', featureKey: 'skill' }), 200);
    expect(screen.getByTestId('map-node-feature-open-n_open')).toHaveTextContent('已开放');
    expect(screen.queryByTestId('feature-gate')).toBeNull();
  });

  it('纯跑图节点（featureKey=null）不渲染系统入口', () => {
    setup(makeNode({ code: 'n_plain' }), 200);
    expect(screen.queryByTestId('feature-gate')).toBeNull();
    expect(screen.queryByTestId('map-node-feature-open-n_plain')).toBeNull();
    expect(screen.getByTestId('map-node-card-n_plain')).toHaveTextContent('纯跑图');
  });

  it('协议 featureKey 原文不上屏', () => {
    setup(makeNode({ code: 'n_raw', featureKey: 'alchemy' }), 999);
    expect(screen.getByTestId('map-node-card-n_raw')).not.toHaveTextContent('alchemy');
  });
});

describe('MapNodeCard · 秘境节点（唯一的挂机入口所在）', () => {
  const realm = makeNode({
    code: 'qy_houshan',
    name: '后山峰',
    kind: 'secret_realm',
    zoneCode: 'zone_houshan',
  });

  it('秘境节点动作文案是「前往秘境」', () => {
    setup(realm, 200);
    expect(screen.getByTestId('map-node-enter-qy_houshan')).toHaveTextContent('前往秘境');
  });

  it('击败 Boss 解锁离线挂机后显示三态中的挂机徽标', () => {
    setup(makeNode({ ...realm, progress: progress({ visited: true, idleUnlocked: true }) }), 200);
    expect(screen.getByTestId('map-node-badge-idle')).toHaveTextContent('离线挂机已解锁');
  });

  it('跑图节点不会显示挂机徽标', () => {
    setup(makeNode({ code: 'n_route', kind: 'route', progress: progress({ visited: true }) }), 200);
    expect(screen.queryByTestId('map-node-badge-idle')).toBeNull();
  });

  it('秘境承载的系统未开放时仍可「前往秘境」（系统与到达是两件事）', () => {
    setup(makeNode({ ...realm, featureKey: 'farm' }), 200);
    expect(screen.getByTestId('feature-gate')).toHaveTextContent('未开放');
    expect(screen.getByTestId('map-node-enter-qy_houshan')).toBeEnabled();
  });
});

describe('MapNodeCard · 动作', () => {
  it('点「前往」回调目标节点 code', async () => {
    const { onEnter } = setup(makeNode({ code: 'n_go' }), 200);
    await userEvent.click(screen.getByTestId('map-node-enter-n_go'));
    expect(onEnter).toHaveBeenCalledWith('n_go');
  });

  it('已点亮传送点的节点可点「传送」', async () => {
    const { onWaypoint } = setup(
      makeNode({ code: 'n_wp', hasWaypoint: true, progress: progress({ visited: true, waypointUnlocked: true }) }),
      200,
    );
    const waypoint = screen.getByTestId('map-node-waypoint-n_wp');
    expect(waypoint).toBeEnabled();
    await userEvent.click(waypoint);
    expect(onWaypoint).toHaveBeenCalledWith('n_wp');
  });

  it('传送点未点亮的节点：按钮禁用', () => {
    setup(makeNode({ code: 'n_wp2', hasWaypoint: true }), 200);
    expect(screen.getByTestId('map-node-waypoint-n_wp2')).toBeDisabled();
  });

  it('没有传送点的节点不渲染传送按钮', () => {
    setup(makeNode({ code: 'n_nowp', hasWaypoint: false }), 200);
    expect(screen.queryByTestId('map-node-waypoint-n_nowp')).toBeNull();
  });

  it('当前所在节点：主行动禁用并显示「当前所在」', () => {
    setup(makeNode({ code: 'n_here' }), 200, true);
    const enter = screen.getByTestId('map-node-enter-n_here');
    expect(enter).toBeDisabled();
    expect(enter).toHaveTextContent('当前所在');
  });
});
