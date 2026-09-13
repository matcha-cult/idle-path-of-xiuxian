/**
 * presentation 单测：环层分组 / 门槛对比（恰好等于 = 可进入）/ 邻接悬挂边防御 / 挂机点判定。
 */
import { describe, expect, it } from 'vitest';
import type { MapEdgeView, MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import {
  canUseWaypoint,
  enterActionLabel,
  featureTextOf,
  groupNodesByRing,
  isPowerEnough,
  isSecretRealm,
  neighborCodes,
  neighborNames,
  nodeKindLabel,
  powerShortfall,
  ringLabel,
} from './presentation.js';

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

function makeEdge(overrides: Partial<MapEdgeView> = {}): MapEdgeView {
  return { fromNodeCode: 'a', toNodeCode: 'b', bidirectional: true, ...overrides };
}

describe('presentation · 环层分组', () => {
  it('已知环层按 外环山门→外门接引→八峰→内环功能→中央主峰 固定顺序分组', () => {
    const nodes = [
      makeNode({ code: 's', ring: 'summit' }),
      makeNode({ code: 'i', ring: 'inner' }),
      makeNode({ code: 'o', ring: 'outer' }),
      makeNode({ code: 'p', ring: 'peaks' }),
      makeNode({ code: 'a', ring: 'approach' }),
    ];
    const groups = groupNodesByRing(nodes);
    expect(groups.map((group) => group.ring)).toEqual(['outer', 'approach', 'peaks', 'inner', 'summit']);
    expect(groups.map((group) => group.label)).toEqual([
      '外环山门',
      '外门接引',
      '八峰',
      '内环功能',
      '中央主峰',
    ]);
  });

  it('未知环层附在已知环层之后，标签走兜底而非协议原文', () => {
    const groups = groupNodesByRing([makeNode({ ring: 'nowhere' }), makeNode({ ring: 'outer' })]);
    expect(groups.map((group) => group.ring)).toEqual(['outer', 'nowhere']);
    expect(groups[1]?.label).toBe('其他');
    expect(ringLabel('nowhere')).toBe('其他');
    expect(ringLabel('nowhere')).not.toContain('nowhere');
  });

  it('空输入返回空分组，不产出空组', () => {
    expect(groupNodesByRing([])).toEqual([]);
  });

  it('节点类型文案：跑图 / 秘境 / 主峰，未知兜底', () => {
    expect(nodeKindLabel('route')).toBe('跑图');
    expect(nodeKindLabel('secret_realm')).toBe('秘境');
    expect(nodeKindLabel('summit')).toBe('主峰');
    expect(nodeKindLabel('???')).toBe('未知');
  });
});

describe('presentation · 战力对比（§6.1 是 ≥；只作参考，不是门槛）', () => {
  it('恰好等于门槛 = 达到参考线', () => {
    expect(isPowerEnough(95, 95)).toBe(true);
  });

  it('低于门槛 1 点 = 未达参考线，差额为 1', () => {
    expect(isPowerEnough(94, 95)).toBe(false);
    expect(powerShortfall(94, 95)).toBe(1);
  });

  it('超出门槛达标且差额为 0', () => {
    expect(isPowerEnough(120, 95)).toBe(true);
    expect(powerShortfall(120, 95)).toBe(0);
  });

  it('无门槛（0 / 负数）恒达标；非有限数一律不达标', () => {
    expect(isPowerEnough(0, 0)).toBe(true);
    expect(isPowerEnough(-5, -10)).toBe(true);
    expect(isPowerEnough(Number.NaN, 10)).toBe(false);
    expect(isPowerEnough(10, Number.NaN)).toBe(false);
    expect(isPowerEnough(Number.POSITIVE_INFINITY, 10)).toBe(false);
    expect(powerShortfall(Number.NaN, 10)).toBe(0);
  });
});

describe('presentation · 秘境节点与动作文案', () => {
  it('只有 kind=secret_realm 是秘境（全图唯一挂机入口所在）', () => {
    expect(isSecretRealm(makeNode({ kind: 'secret_realm' }))).toBe(true);
    expect(isSecretRealm(makeNode({ kind: 'route' }))).toBe(false);
    expect(isSecretRealm(makeNode({ kind: 'summit' }))).toBe(false);
  });

  it('动作文案按 kind 区分秘境 / 其余', () => {
    expect(enterActionLabel(makeNode({ kind: 'secret_realm' }))).toBe('前往秘境');
    expect(enterActionLabel(makeNode({ kind: 'route' }))).toBe('前往');
    expect(enterActionLabel(makeNode({ kind: 'summit' }))).toBe('前往');
  });

  it('承载系统文案：纯跑图 / 已开放 / 未开放，且不回显协议原文', () => {
    expect(featureTextOf(null)).toBe('纯跑图');
    expect(featureTextOf('skill')).toBe('功法（已开放）');
    expect(featureTextOf('farm')).toBe('灵田（未开放）');
    expect(featureTextOf('mystery')).toBe('此地系统（未开放）');
    expect(featureTextOf('mystery')).not.toContain('mystery');
  });
});

describe('presentation · 邻接（悬挂边防御）', () => {
  const visible = new Map<string, MapNodeView>([
    ['a', makeNode({ code: 'a', name: '甲' })],
    ['b', makeNode({ code: 'b', name: '乙' })],
  ]);
  const codes = new Set(visible.keys());

  it('双向边两个方向都通', () => {
    const edges = [makeEdge({ fromNodeCode: 'a', toNodeCode: 'b' })];
    expect(neighborCodes('a', edges, codes)).toEqual(['b']);
    expect(neighborCodes('b', edges, codes)).toEqual(['a']);
  });

  it('单向边只认 from → to', () => {
    const edges = [makeEdge({ fromNodeCode: 'a', toNodeCode: 'b', bidirectional: false })];
    expect(neighborCodes('a', edges, codes)).toEqual(['b']);
    expect(neighborCodes('b', edges, codes)).toEqual([]);
  });

  it('引用了未下发节点的边被丢弃，不崩也不泄露', () => {
    const edges = [
      makeEdge({ fromNodeCode: 'a', toNodeCode: 'ghost' }),
      makeEdge({ fromNodeCode: 'a', toNodeCode: 'b' }),
    ];
    expect(neighborCodes('a', edges, codes)).toEqual(['b']);
    expect(neighborNames('a', edges, visible)).toEqual(['乙']);
  });

  it('自环与重复边不重复计数', () => {
    const edges = [
      makeEdge({ fromNodeCode: 'a', toNodeCode: 'a' }),
      makeEdge({ fromNodeCode: 'a', toNodeCode: 'b' }),
      makeEdge({ fromNodeCode: 'b', toNodeCode: 'a' }),
    ];
    expect(neighborCodes('a', edges, codes)).toEqual(['b']);
  });

  it('空边集合返回空邻接', () => {
    expect(neighborCodes('a', [], codes)).toEqual([]);
    expect(neighborNames('a', [], visible)).toEqual([]);
  });
});

describe('presentation · 传送可用性', () => {
  it('有传送点且已点亮且非当前节点才可传送', () => {
    const node = makeNode({ code: 'a', hasWaypoint: true, progress: progress({ waypointUnlocked: true }) });
    expect(canUseWaypoint(node, null)).toBe(true);
    expect(canUseWaypoint(node, 'b')).toBe(true);
    expect(canUseWaypoint(node, 'a')).toBe(false);
  });

  it('没有传送点或未点亮时不可传送', () => {
    expect(canUseWaypoint(makeNode({ hasWaypoint: false }), null)).toBe(false);
    expect(
      canUseWaypoint(makeNode({ hasWaypoint: true, progress: progress({ waypointUnlocked: false }) }), null),
    ).toBe(false);
  });
});
