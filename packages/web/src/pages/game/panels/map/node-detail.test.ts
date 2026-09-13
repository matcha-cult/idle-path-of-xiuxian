/**
 * `node-detail.ts` 单测（T1 数据分层的纯逻辑）。
 *
 * 核心防回归：**`level === null` 的职能型枢纽不得产出任何战斗数据文案**，
 * 且 `null` 绝不能被回落成 `0`。
 */
import { describe, expect, it } from 'vitest';
import type { MapNodeView } from '@idle-path/ionet-transport';
import {
  detailSubtitleTail,
  hubNoteOf,
  isCombatNode,
  nodeCompareText,
  nodeDetailEntries,
} from './node-detail.js';

function node(overrides: Partial<MapNodeView>): MapNodeView {
  return {
    id: 1,
    code: 'n',
    name: '节点',
    ring: 'peaks',
    sector: null,
    kind: 'route',
    featureKey: null,
    level: null,
    threshold: null,
    hasWaypoint: false,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    gridRow: 0,
    gridCol: 0,
    description: null,
    adjacent: false,
    progress: { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false },
    ...overrides,
  } as MapNodeView;
}

describe('isCombatNode / 分流键', () => {
  it('只有 level 非 null 才算有战斗数据', () => {
    expect(isCombatNode(node({ level: 5, threshold: 75 }))).toBe(true);
    expect(isCombatNode(node({ level: 1, threshold: 10 }))).toBe(true);
    expect(isCombatNode(node({ level: null, threshold: null }))).toBe(false);
  });

  it('level=0 也视为有战斗数据（0 是显式值，不是缺失）', () => {
    expect(isCombatNode(node({ level: 0, threshold: Number.NaN }))).toBe(true);
  });
});

describe('nodeDetailEntries', () => {
  it('职能型枢纽：不含怪物境界 / 难度参考门槛，保留战力 / 类型 / 承载系统', () => {
    const entries = nodeDetailEntries(node({ kind: 'summit', featureKey: 'quest' }), 42);
    const keys = entries.map((e) => e.key);
    expect(keys).toEqual(['power', 'kind', 'system']);
    expect(entries.find((e) => e.key === 'system')?.span).toBe(2);
    expect(entries.some((e) => e.key === 'level' || e.key === 'threshold')).toBe(false);
    // null 绝不能被回落成 0
    for (const entry of entries) expect(String(entry.value)).not.toBe('0');
  });

  it('秘境节点：怪物境界 + 门槛 + 战力 + 类型 + 承载系统（顺序稳定）', () => {
    const entries = nodeDetailEntries(node({ kind: 'secret_realm', level: 5, threshold: 75 }), 100);
    expect(entries.map((e) => e.key)).toEqual(['level', 'threshold', 'power', 'kind', 'system']);
    expect(entries[0]?.value).toBe('第 5 境');
    expect(entries[1]?.value).toBe(75);
  });

  it('边界：有 level 无 threshold → 门槛显示「未知」（配置错误可见，不回落 0）', () => {
    const entries = nodeDetailEntries(node({ level: 5, threshold: null }), 1);
    expect(entries.find((e) => e.key === 'threshold')?.value).toBe('未知');
  });

  it('边界：playerPower=0 / 负数 / NaN 均原样展示，不抛错', () => {
    for (const power of [0, -1, Number.NaN]) {
      const entries = nodeDetailEntries(node({ level: 5, threshold: 75 }), power);
      expect(entries.find((e) => e.key === 'power')?.value).toBe(power);
    }
  });
});

describe('nodeCompareText', () => {
  it('战斗节点给出中性文案（恰好等于 / 远低 / 远超 都不做红绿判定）', () => {
    expect(nodeCompareText(node({ level: 5, threshold: 95 }), 95)).toBe('参考战力 95 · 我的战力 95');
    expect(nodeCompareText(node({ level: 5, threshold: 95 }), 1)).toBe('参考战力 95 · 我的战力 1');
    expect(nodeCompareText(node({ level: 5, threshold: 95 }), 999)).toBe('参考战力 95 · 我的战力 999');
  });

  it('职能型枢纽恒为 null（右栏不得出现任何战力对比）', () => {
    expect(nodeCompareText(node({ level: null, threshold: null }), 100)).toBeNull();
    expect(nodeCompareText(node({ level: null, threshold: 95 }), 100)).toBeNull();
  });

  it('门槛缺失时也返回 null（不产出「参考战力 null」半截文案）', () => {
    expect(nodeCompareText(node({ level: 5, threshold: null }), 100)).toBeNull();
  });

  it('边界：门槛 0 是合法数值（显式配置），照常出文案', () => {
    expect(nodeCompareText(node({ level: 5, threshold: 0 }), 0)).toBe('参考战力 0 · 我的战力 0');
  });
});

describe('hubNoteOf', () => {
  it('职能型枢纽给「此地无怪物」说明；战斗节点为 null', () => {
    expect(hubNoteOf(node({ level: null }))).toContain('此地无怪物');
    expect(hubNoteOf(node({ level: 5, threshold: 1 }))).toBeNull();
  });
});

describe('detailSubtitleTail', () => {
  it('职能型枢纽的小标题不含「难度参考」', () => {
    expect(detailSubtitleTail(node({ level: null }))).toBe('传送点 / 职能入口');
    expect(detailSubtitleTail(node({ level: 5, threshold: 75 }))).toContain('难度参考');
  });
});
