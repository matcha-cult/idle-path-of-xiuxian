/**
 * `waypoint-gate` 单测 —— 「**必须和传送点交互之后才可解锁传送**」这条机制的全部边界。
 *
 * 最关键的一条：服务端 `progress.waypointUnlocked` 为真时，**仍然**要求本会话交互过
 * —— 否则「到达即自动点亮」会把交互这一步绕过，机制不复存在。
 */
import { describe, expect, it } from 'vitest';
import { makeNode } from '../../../test/helpers/map-lab-fixtures.js';
import {
  HERE_HINT,
  NO_WAYPOINT_HINT,
  TELEPORT_HINT,
  WALK_HINT,
  WAYPOINT_LOCKED_HINT,
  WAYPOINT_READY_HINT,
  WAYPOINT_ELSEWHERE_HINT,
  isNodeReachable,
  travelDecision,
  unlockWaypoint,
  unlockedCount,
  waypointInteractState,
} from './waypoint-gate.js';

const none: ReadonlySet<string> = new Set<string>();
const has = (...codes: string[]): ReadonlySet<string> => new Set(codes);

describe('travelDecision · 优先级', () => {
  it('已在原地 → here（哪怕它同时相邻）', () => {
    const node = makeNode({ adjacent: true });
    expect(travelDecision(node, 'qy_gate_e', none)).toEqual({ kind: 'here', hint: HERE_HINT });
  });

  it('相邻 → walk（走路免费，不该被当成传送）', () => {
    const node = makeNode({ adjacent: true });
    expect(travelDecision(node, 'qy_gate_n', none)).toEqual({ kind: 'walk', hint: WALK_HINT });
  });

  it('相邻且传送点也已点亮 → 仍是 walk（相邻优先）', () => {
    const node = makeNode({ adjacent: true });
    expect(travelDecision(node, 'qy_gate_n', has('qy_gate_e')).kind).toBe('walk');
  });

  it('不相邻 + 有传送点 + **已交互** → teleport', () => {
    const node = makeNode({ adjacent: false, hasWaypoint: true });
    expect(travelDecision(node, 'qy_gate_n', has('qy_gate_e'))).toEqual({
      kind: 'teleport',
      hint: TELEPORT_HINT,
    });
  });

  it('不相邻 + 有传送点 + **未交互** → blocked，并教玩家去交互（这就是机制本身）', () => {
    const node = makeNode({ adjacent: false, hasWaypoint: true });
    expect(travelDecision(node, 'qy_gate_n', none)).toEqual({
      kind: 'blocked',
      hint: WAYPOINT_LOCKED_HINT,
    });
  });

  it('⭐ 服务端已 waypointUnlocked 也不能绕过交互门槛（否则机制形同虚设）', () => {
    const node = makeNode({
      adjacent: false,
      hasWaypoint: true,
      progress: { visited: true, waypointUnlocked: true, idleUnlocked: false, cleared: false },
    });
    expect(travelDecision(node, 'qy_gate_n', none).kind).toBe('blocked');
  });

  it('不相邻 + 无传送点 → blocked，提示与「没交互」区分开（玩家要知道是没门路）', () => {
    const node = makeNode({ adjacent: false, hasWaypoint: false });
    expect(travelDecision(node, 'qy_gate_n', none)).toEqual({
      kind: 'blocked',
      hint: NO_WAYPOINT_HINT,
    });
  });

  it('无传送点但已交互过同一 code（脏数据）→ 仍然是 blocked，不会凭空能传', () => {
    const node = makeNode({ adjacent: false, hasWaypoint: false });
    expect(travelDecision(node, 'qy_gate_n', has('qy_gate_e')).kind).toBe('blocked');
  });

  it('currentCode 为 null（新角色）→ 没有任何地点是 here', () => {
    const node = makeNode({ adjacent: false, hasWaypoint: false });
    expect(travelDecision(node, null, none).kind).toBe('blocked');
    expect(travelDecision(makeNode({ adjacent: true }), null, none).kind).toBe('walk');
  });
});

describe('isNodeReachable（画布是否画成暗色 disabled）', () => {
  it('here / walk / teleport 都算可达', () => {
    expect(isNodeReachable(makeNode({ code: 'a' }), 'a', none)).toBe(true);
    expect(isNodeReachable(makeNode({ adjacent: true }), 'x', none)).toBe(true);
    expect(isNodeReachable(makeNode({ adjacent: false, hasWaypoint: true }), 'x', has('qy_gate_e'))).toBe(
      true,
    );
  });

  it('未交互的传送点 → 不可达（画布上就是暗的，点击不选中）', () => {
    expect(isNodeReachable(makeNode({ adjacent: false, hasWaypoint: true }), 'x', none)).toBe(false);
  });

  it('原地即使不相邻、无传送点也可达（不会把自己画成暗色）', () => {
    const node = makeNode({ code: 'me', adjacent: false, hasWaypoint: false });
    expect(isNodeReachable(node, 'me', none)).toBe(true);
  });
});

describe('waypointInteractState（右栏交互区状态）', () => {
  const at = (code: string): string => code;

  it('没有传送点 → none（不给按钮，避免「点了没反应」）', () => {
    expect(waypointInteractState(makeNode({ hasWaypoint: false }), 'qy_gate_e', none).kind).toBe('none');
  });

  it('⭐ 人在该节点且未点亮 → ready（可以交互）', () => {
    expect(waypointInteractState(makeNode(), at('qy_gate_e'), none)).toEqual({
      kind: 'ready',
      hint: WAYPOINT_READY_HINT,
    });
  });

  it('⭐ 人不在该节点且未点亮 → elsewhere（**不能隔空点亮**，否则机制形同虚设）', () => {
    const node = makeNode({ code: 'qy_gate_s', adjacent: false });
    expect(waypointInteractState(node, 'qy_gate_n', none)).toEqual({
      kind: 'elsewhere',
      hint: WAYPOINT_ELSEWHERE_HINT,
    });
  });

  it('已点亮 → done（无论人在哪）', () => {
    expect(waypointInteractState(makeNode(), 'qy_gate_n', has('qy_gate_e')).kind).toBe('done');
    expect(waypointInteractState(makeNode(), 'qy_gate_e', has('qy_gate_e')).kind).toBe('done');
  });

  it('currentCode 为 null（新角色）→ 一律 elsewhere，不会误给交互入口', () => {
    expect(waypointInteractState(makeNode(), null, none).kind).toBe('elsewhere');
  });

  it('已点亮优先于「人在此地」（重复交互不应再出现按钮）', () => {
    expect(waypointInteractState(makeNode(), 'qy_gate_e', has('qy_gate_e')).kind).toBe('done');
  });
});

describe('unlockWaypoint（交互的结果）', () => {
  it('返回包含该节点的**新集合**，不改入参（React 状态更新要靠新引用）', () => {
    const before = has('a');
    const after = unlockWaypoint(before, 'b');
    expect([...after].sort()).toEqual(['a', 'b']);
    expect([...before]).toEqual(['a']);
    expect(after).not.toBe(before);
  });

  it('重复交互幂等（集合不重复、引用仍然更新）', () => {
    const once = unlockWaypoint(none, 'a');
    const twice = unlockWaypoint(once, 'a');
    expect([...twice]).toEqual(['a']);
  });

  it('空集合也能正常加（新角色第一个传送点）', () => {
    expect([...unlockWaypoint(none, 'qy_gate_n')]).toEqual(['qy_gate_n']);
  });
});

describe('unlockedCount（概览统计）', () => {
  const nodes = [
    makeNode({ code: 'w1', hasWaypoint: true }),
    makeNode({ code: 'w2', hasWaypoint: true }),
    makeNode({ code: 'plain', hasWaypoint: false }),
  ];

  it('只数「有传送点且已交互」的节点', () => {
    expect(unlockedCount(nodes, none)).toBe(0);
    expect(unlockedCount(nodes, has('w1'))).toBe(1);
    expect(unlockedCount(nodes, has('w1', 'w2', 'plain'))).toBe(2);
  });

  it('空节点数组 → 0（不抛错）', () => {
    expect(unlockedCount([], has('a'))).toBe(0);
  });
});
