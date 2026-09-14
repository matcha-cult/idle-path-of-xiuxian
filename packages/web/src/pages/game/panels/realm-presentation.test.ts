/**
 * 境界面板纯函数单测（从 `RealmPanel.tsx` 拆出后直接测，比只经面板渲染更快定位）。
 *
 * 覆盖：下一境名（含封顶/越界）、可穿阶、§22「可进秘境」只列免费历练秘境、
 * 破境拦截原因三分支、以及解锁明细的拼装。
 */
import { describe, expect, it } from 'vitest';
import type { RealmStatusData, ZoneBreakthroughView } from '@idle-path/ionet-transport';
import {
  TOTAL_REALMS,
  breakthroughBlockReason,
  enterableZoneText,
  nextRealmName,
  unlockEntries,
  wearableTier,
} from './realm-presentation.js';

function status(overrides: Partial<RealmStatusData> = {}): RealmStatusData {
  return {
    realm: 1,
    realmName: '铜皮',
    lingyun: 0,
    nextCost: 200,
    isMax: false,
    ...overrides,
  } as RealmStatusData;
}

function realm(
  realmNo: number,
  tierKind: ZoneBreakthroughView['tierKind'],
  name: string,
  canBreakthrough: boolean,
): ZoneBreakthroughView {
  return {
    code: `zone_r${realmNo}`,
    name,
    realm: realmNo,
    tierKind,
    canBreakthrough,
    lockReason: canBreakthrough ? 'ok' : 'item_required',
    unlockItemCode: canBreakthrough ? null : `item_mijingling_r${realmNo}`,
    cleared: false,
    clears: 0,
    bestFloor: 0,
    maxFloor: 3,
    basePower: 20 * realmNo - 5,
    powerStep: 12,
  };
}

describe('realm-presentation · 境界名与装备阶', () => {
  it('境界总数取协议常量（14 境）', () => {
    expect(TOTAL_REALMS).toBe(14);
  });

  it('下一境名：普通取 REALMS[realm]，封顶与越界都给占位符', () => {
    expect(nextRealmName(1, false)).toBe('草根');
    expect(nextRealmName(1, true)).toBe('—');
    expect(nextRealmName(99, false)).toBe('—');
  });

  it('可穿装备阶：非封顶 realm+1，封顶维持当前阶', () => {
    expect(wearableTier(3, false)).toBe(4);
    expect(wearableTier(14, true)).toBe(14);
  });
});

describe('realm-presentation · §22 可进秘境', () => {
  it('只列免费历练秘境，并提示特殊秘境需道具', () => {
    const text = enterableZoneText([
      realm(1, 'training', '青云山脚', true),
      realm(6, 'special', '地脉深窟', false),
    ]);

    expect(text).toContain('青云山脚');
    expect(text).not.toContain('地脉深窟');
    expect(text).toContain('特殊秘境需道具');
  });

  it('名录为空（老服务端）→ 指路秘境石台，不显示空串', () => {
    expect(enterableZoneText([])).toBe('暂无（以秘境石台为准）');
  });
});

describe('realm-presentation · 破境拦截原因', () => {
  it('封顶优先于其它原因', () => {
    expect(breakthroughBlockReason(status({ isMax: true, nextCost: null }))).toBe('已至封顶，暂无更高境界');
  });

  it('缺少下一境消耗 → 明确说没有数据（不是「灵韵不足」）', () => {
    expect(breakthroughBlockReason(status({ nextCost: null, lingyun: 0 }))).toBe('暂无下一境消耗数据');
  });

  it('灵韵不足 → 给出还差多少；刚好够 → 空串（可破境）', () => {
    expect(breakthroughBlockReason(status({ nextCost: 200, lingyun: 50 }))).toContain('还差');
    expect(breakthroughBlockReason(status({ nextCost: 200, lingyun: 200 }))).toBe('');
    expect(breakthroughBlockReason(status({ nextCost: 200, lingyun: 999 }))).toBe('');
  });
});

describe('realm-presentation · 解锁明细', () => {
  it('三项：下一境 / 可穿 T 阶 / 可进秘境（末项跨两列）', () => {
    const entries = unlockEntries(status({ realm: 2, lingyun: 0 }), [realm(1, 'training', '青云山脚', true)]);

    expect(entries.map((entry) => entry.key)).toEqual(['nextRealm', 'tier', 'zones']);
    expect(entries[0]?.value).toBe('柳筋');
    expect(entries[1]?.value).toBe('T3');
    expect(entries[2]?.span).toBe(2);
  });

  it('封顶时「下一境」写「已至封顶」，阶维持当前', () => {
    const entries = unlockEntries(status({ realm: 14, isMax: true, nextCost: null }), []);

    expect(entries[0]?.value).toBe('已至封顶');
    expect(entries[1]?.value).toBe('T14');
  });
});