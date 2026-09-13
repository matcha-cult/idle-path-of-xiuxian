/**
 * MapNodeCard 单测（P2.0 v3）：难度参考只展示不拦路 / 三态徽标 / 对象列表与 FeatureGate /
 * 跑图与传送回调 / **按钮矩阵 8 种组合** / 秘境节点的「进入历练」 / 协议字段不上屏。
 *
 * v3 关键差异：**战力不再禁用「前往此地」**；「前往」只看 `adjacent`（山门由服务端恒置 true）。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MapNodeView, MapObjectView, NodeProgressView } from '@idle-path/ionet-transport';
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
    // 默认给**战斗数据**（有 level/threshold 才渲染「怪物境界 / 参考战力」）；
    // 职能型枢纽用下方 makeHub（level/threshold = null）。
    level: 5,
    threshold: 95,
    hasWaypoint: false,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    progress: progress(),
    // v3：默认相邻（可前往）；不可前往的用例显式 adjacent:false
    adjacent: true,
    ...overrides,
  } as MapNodeView;
}

/** 职能型枢纽（山门 / 八峰 / 四院 / 主峰）：`level` / `threshold` 都是 `null`（T1 数据分层）。 */
function makeHub(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return makeNode({ level: null, threshold: null, ...overrides });
}

function makeObject(overrides: Partial<MapObjectView> = {}): MapObjectView {
  return {
    id: 1,
    code: 'obj_x',
    nodeCode: 'n_1',
    kind: 'office',
    name: '某堂',
    featureKey: 'alchemy',
    description: null,
    orderIndex: 1,
    ...overrides,
  };
}

function setup(
  node: MapNodeView,
  playerPower: number,
  options: { current?: boolean; withRealm?: boolean; objects?: MapObjectView[] } = {},
) {
  const { current = false, withRealm = true, objects = [] } = options;
  const onEnter = vi.fn();
  const onWaypoint = vi.fn();
  const onEnterRealm = vi.fn();
  render(
    <MapNodeCard
      node={node}
      playerPower={playerPower}
      current={current}
      objects={objects}
      onEnter={onEnter}
      onWaypoint={onWaypoint}
      {...(withRealm ? { onEnterRealm } : {})}
    />,
  );
  return { onEnter, onWaypoint, onEnterRealm };
}

/** 历练秘境峰（用户定调：挂机只能在它这里）。 */
const REALM = makeNode({
  code: 'qy_peak_xunlian',
  name: '第八峰·历练',
  ring: 'peaks',
  sector: null,
  kind: 'secret_realm',
  zoneCode: 'zone_houshan',
  level: 5,
  threshold: 75,
  progress: progress({ visited: true }),
});

describe('MapNodeCard · 战力只作参考、不拦路、不做红绿判定（P2.0 v3 §5 + T5）', () => {
  it('恰好等于参考线：中性文案「参考战力 95 · 我的战力 95」，按钮可用', () => {
    setup(makeNode({ code: 'n_eq', threshold: 95 }), 95);
    const compare = screen.getByTestId('map-node-compare-n_eq');
    expect(compare).toHaveTextContent('参考战力 95 · 我的战力 95');
    expect(compare.textContent ?? '').not.toMatch(/不足|差\s*\d|偏低|充足/);
    expect(screen.getByTestId('map-node-enter-n_eq')).toBeEnabled();
  });

  it('战力远低于参考线：文案仍然中性（不喊「不足 / 差 N」），按钮**仍然可用**（v3 防回归）', () => {
    setup(makeNode({ code: 'n_low', threshold: 95 }), 1);
    const compare = screen.getByTestId('map-node-compare-n_low');
    expect(compare).toHaveTextContent('参考战力 95 · 我的战力 1');
    expect(compare.textContent ?? '').not.toMatch(/不足|差\s*\d|偏低|充足/);
    expect(screen.getByTestId('map-node-enter-n_low')).toBeEnabled();
  });

  it('超出参考线：文案同口径（不做「充足」红绿判定）', () => {
    setup(makeNode({ code: 'n_hi', threshold: 95 }), 120);
    const compare = screen.getByTestId('map-node-compare-n_hi');
    expect(compare).toHaveTextContent('参考战力 95 · 我的战力 120');
    expect(compare.textContent ?? '').not.toMatch(/不足|差\s*\d|偏低|充足/);
  });
});

describe('MapNodeCard · 数据分层（T1：宗门内不显示怪物数据，防回归）', () => {
  it('职能型枢纽：整张卡不出现「怪物境界 / 难度参考门槛 / 参考战力」', () => {
    setup(makeHub({ code: 'qy_cangjingge', name: '藏经阁' }), 42);
    const card = screen.getByTestId('map-node-card-qy_cangjingge');
    expect(card).not.toHaveTextContent('怪物境界');
    expect(card).not.toHaveTextContent('难度参考门槛');
    expect(card).not.toHaveTextContent('参考战力');
    // 也绝不能把 null 回落成 0（Number(null) === 0 是这条要修的荒诞）
    expect(card).not.toHaveTextContent('第 0 境');
    expect(card).not.toHaveTextContent('参考战力 0');
    expect(screen.queryByTestId('map-node-compare-qy_cangjingge')).toBeNull();
    expect(screen.getByTestId('map-node-hub-qy_cangjingge')).toHaveTextContent('此地无怪物');
  });

  it('职能型枢纽：我的战力 / 节点类型 / 承载系统仍显示，职能对象照常列出', () => {
    setup(makeHub({ code: 'qy_baigongyuan', featureKey: 'alchemy' }), 42, {
      objects: [
        makeObject({ id: 1, code: 'obj_danxiayuan', nodeCode: 'qy_baigongyuan', name: '丹霞院', featureKey: 'alchemy' }),
      ],
    });
    const card = screen.getByTestId('map-node-card-qy_baigongyuan');
    expect(card).toHaveTextContent('我的战力');
    expect(card).toHaveTextContent('42');
    expect(card).toHaveTextContent('节点类型');
    expect(screen.getByTestId('map-objects-qy_baigongyuan')).toHaveTextContent('丹霞院');
  });

  it('秘境节点（有战斗数据）：保留「怪物境界 第 5 境 / 难度参考门槛 75 / 中性对比」', () => {
    setup(makeNode({ ...REALM, code: 'qy_peak_xunlian' }), 100);
    const card = screen.getByTestId('map-node-card-qy_peak_xunlian');
    expect(card).toHaveTextContent('怪物境界');
    expect(card).toHaveTextContent('第 5 境');
    expect(card).toHaveTextContent('难度参考门槛');
    expect(card).toHaveTextContent('75');
    expect(screen.getByTestId('map-node-compare-qy_peak_xunlian')).toHaveTextContent(
      '参考战力 75 · 我的战力 100',
    );
    expect(screen.queryByTestId('map-node-hub-qy_peak_xunlian')).toBeNull();
  });

  it('边界：有境界但门槛缺失（配置漂移）→ 门槛显示「未知」，不渲染对比行', () => {
    setup(makeNode({ code: 'n_broken', level: 5, threshold: null }), 100);
    const card = screen.getByTestId('map-node-card-n_broken');
    expect(card).toHaveTextContent('未知');
    expect(card).not.toHaveTextContent('参考战力');
    expect(screen.queryByTestId('map-node-compare-n_broken')).toBeNull();
    expect(screen.queryByTestId('map-node-hub-n_broken')).toBeNull();
  });
});

describe('MapNodeCard · 按钮矩阵（adjacent × waypointUnlocked × powerEnough 八种组合）', () => {
  const CASES = [true, false].flatMap((adjacent) =>
    [true, false].flatMap((waypointUnlocked) =>
      [true, false].map((powerEnough) => ({ adjacent, waypointUnlocked, powerEnough })),
    ),
  );

  it.each(CASES)(
    'adjacent=$adjacent / waypointUnlocked=$waypointUnlocked / powerEnough=$powerEnough',
    ({ adjacent, waypointUnlocked, powerEnough }) => {
      setup(
        makeNode({
          code: 'n_m',
          adjacent,
          hasWaypoint: true,
          threshold: 95,
          progress: progress({ waypointUnlocked }),
        }),
        powerEnough ? 200 : 1,
      );
      // 前往只看相邻，战力不影响
      expect(screen.getByTestId('map-node-enter-n_m'))[adjacent ? 'toBeEnabled' : 'toBeDisabled']();
      // 传送只看传送点是否点亮
      expect(screen.getByTestId('map-node-waypoint-n_m'))[
        waypointUnlocked ? 'toBeEnabled' : 'toBeDisabled'
      ]();
    },
  );
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

describe('MapNodeCard · 对象列表（一院多职能，P2.0 §3）', () => {
  it('百工院列出「丹霞院 / 百器阁」两项：未实现走 FeatureGate，已实现给标签', () => {
    setup(makeNode({ code: 'qy_baigongyuan', featureKey: 'alchemy' }), 200, {
      objects: [
        makeObject({ id: 1, code: 'obj_danxiayuan', nodeCode: 'qy_baigongyuan', name: '丹霞院', featureKey: 'alchemy' }),
        makeObject({ id: 2, code: 'obj_baiqige', nodeCode: 'qy_baigongyuan', name: '百器阁', featureKey: 'craft' }),
      ],
    });
    expect(screen.getByTestId('map-objects-qy_baigongyuan')).toHaveTextContent('丹霞院');
    expect(screen.getByTestId('map-objects-qy_baigongyuan')).toHaveTextContent('百器阁');
    // 炼丹未实现 -> FeatureGate（未开放 + 禁用入口）
    expect(screen.getByTestId('map-object-entry-obj_danxiayuan')).toBeDisabled();
    expect(screen.getByTestId('feature-gate')).toHaveTextContent('未开放');
    // 炼器已实现 -> 已开放标签，没有未开放门
    expect(screen.getByTestId('map-object-open-obj_baiqige')).toHaveTextContent('已开放');
  });

  it('没有对象时给出空态提示（不渲染 FeatureGate）', () => {
    setup(makeNode({ code: 'n_noobj' }), 200);
    expect(screen.getByTestId('map-objects-empty-n_noobj')).toHaveTextContent('暂无职能入口');
    expect(screen.queryByTestId('feature-gate')).toBeNull();
  });

  it('协议 featureKey 原文不上屏（含对象层）', () => {
    setup(makeNode({ code: 'n_raw' }), 200, {
      objects: [makeObject({ nodeCode: 'n_raw', featureKey: 'alchemy' })],
    });
    const card = screen.getByTestId('map-node-card-n_raw');
    expect(card).not.toHaveTextContent('alchemy');
    expect(card).not.toHaveTextContent('office');
  });
});

describe('MapNodeCard · 秘境节点（唯一的挂机入口所在）', () => {
  it('秘境节点动作文案是「前往秘境」', () => {
    setup(REALM, 200);
    expect(screen.getByTestId(`map-node-enter-${REALM.code}`)).toHaveTextContent('前往秘境');
  });

  it('击败 Boss 解锁离线挂机后显示三态中的挂机徽标', () => {
    setup(makeNode({ ...REALM, progress: progress({ visited: true, idleUnlocked: true }) }), 200);
    expect(screen.getByTestId('map-node-badge-idle')).toHaveTextContent('离线挂机已解锁');
  });

  it('跑图节点不会显示挂机徽标', () => {
    setup(makeNode({ code: 'n_route', kind: 'route', progress: progress({ visited: true }) }), 200);
    expect(screen.queryByTestId('map-node-badge-idle')).toBeNull();
  });
});

describe('MapNodeCard · 动作', () => {
  it('点「前往」回调目标节点 code', async () => {
    const { onEnter } = setup(makeNode({ code: 'n_go' }), 200);
    await userEvent.click(screen.getByTestId('map-node-enter-n_go'));
    expect(onEnter).toHaveBeenCalledWith('n_go');
  });

  it('不相邻的非山门：前往按钮禁用（浮层说明在悬停时才出，不在静态 DOM）', () => {
    setup(makeNode({ code: 'n_far', adjacent: false }), 999);
    expect(screen.getByTestId('map-node-enter-n_far')).toBeDisabled();
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
    setup(makeNode({ code: 'n_here' }), 200, { current: true });
    const enter = screen.getByTestId('map-node-enter-n_here');
    expect(enter).toBeDisabled();
    expect(enter).toHaveTextContent('当前所在');
  });
});

describe('MapNodeCard · 秘境节点的「进入历练」（地图→历练秘境峰→挂机的闭环）', () => {
  it('秘境节点渲染「进入历练」，点击回传 zoneCode（不是节点 code）', async () => {
    const { onEnterRealm } = setup(REALM, 100);
    await userEvent.click(screen.getByTestId(`map-node-enter-realm-${REALM.code}`));
    expect(onEnterRealm).toHaveBeenCalledTimes(1);
    expect(onEnterRealm).toHaveBeenCalledWith('zone_houshan');
  });

  it('未到达该节点时禁用（先跑图再历练）', () => {
    setup(makeNode({ ...REALM, progress: progress({ visited: false }) }), 100);
    expect(screen.getByTestId(`map-node-enter-realm-${REALM.code}`)).toBeDisabled();
  });

  it('已解锁离线挂机时，文案体现出来（这是 D2 的结果）', () => {
    setup(makeNode({ ...REALM, progress: progress({ visited: true, idleUnlocked: true }) }), 100);
    expect(screen.getByTestId(`map-node-enter-realm-${REALM.code}`)).toHaveTextContent('可离线挂机');
  });

  it('非秘境节点不给「进入历练」（跑图点不是挂机处）', () => {
    setup(makeNode({ kind: 'route', zoneCode: null }), 100);
    expect(screen.queryByTestId('map-node-enter-realm-n_1')).toBeNull();
  });

  it('未接 onEnterRealm 时不渲染（可选能力，不强制调用方）', () => {
    setup(REALM, 100, { withRealm: false });
    expect(screen.queryByTestId(`map-node-enter-realm-${REALM.code}`)).toBeNull();
  });
});
