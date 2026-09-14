/**
 * 秘境展示判定纯函数边界（§22：tier / 层数 / 通关轮数三支；§23：挂机点选项两支）。
 *
 * 旧的 `challengeBlockReason` / `prevZoneHint` 随「秘境页面只列已突破秘境」一并删除：
 * 未突破的秘境根本不下发，前端不再有任何「为什么进不去」的锁判定。
 */
import { describe, expect, it } from 'vitest';
import type { ZoneBreakthroughView, ZoneView } from '@idle-path/ionet-transport';
import {
  idleTargetName,
  idleTargetOptions,
  zoneClearsText,
  zoneFloorText,
  zoneTierLabel,
} from './presentation.js';

function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
    id: 1,
    code: 'zone_r1',
    name: '青云山',
    realm: 1,
    tierKind: 'training',
    orderIndex: 1,
    idleAllowed: true,
    unlockItemCode: null,
    unitCode: 'u1',
    bossCode: null,
    basePower: 20,
    powerStep: 12,
    maxFloor: 3,
    lingyunBonusPerFloor: 2,
    current: false,
    progress: { floor: 3, bestFloor: 3, cleared: true, clears: 2 },
    ...overrides,
  };
}

function makeBreakthrough(overrides: Partial<ZoneBreakthroughView> = {}): ZoneBreakthroughView {
  return {
    code: 'zone_r1',
    name: '青云山',
    realm: 1,
    tierKind: 'training',
    canBreakthrough: true,
    lockReason: 'ok',
    unlockItemCode: null,
    cleared: true,
    clears: 2,
    bestFloor: 3,
    maxFloor: 3,
    basePower: 20,
    powerStep: 12,
    ...overrides,
  };
}

describe('zoneTierLabel', () => {
  it('training → 历练秘境，special → 特殊秘境（协议 key 不上屏）', () => {
    expect(zoneTierLabel('training')).toBe('历练秘境');
    expect(zoneTierLabel('special')).toBe('特殊秘境');
  });
});

describe('zoneFloorText', () => {
  it('正常拼接', () => {
    expect(zoneFloorText(4, 10)).toBe('进度 4 / 10 层');
  });

  it('bestFloor 缺失或非有限时按 0', () => {
    expect(zoneFloorText(undefined, 10)).toBe('进度 0 / 10 层');
    expect(zoneFloorText(Number.NaN, 10)).toBe('进度 0 / 10 层');
    expect(zoneFloorText(Number.POSITIVE_INFINITY, 10)).toBe('进度 0 / 10 层');
  });

  it('maxFloor 非有限时不显示 NaN', () => {
    expect(zoneFloorText(2, Number.NaN)).toBe('进度 2 / 0 层');
    expect(zoneFloorText(2, Number.NEGATIVE_INFINITY)).toBe('进度 2 / 0 层');
  });

  it('边界：0 层也能正常展示', () => {
    expect(zoneFloorText(0, 3)).toBe('进度 0 / 3 层');
  });
});

describe('zoneClearsText', () => {
  it('未打满一轮（0 / 缺失 / 非有限）→ 尚未打满一轮', () => {
    expect(zoneClearsText(0)).toBe('尚未打满一轮');
    expect(zoneClearsText(undefined)).toBe('尚未打满一轮');
    expect(zoneClearsText(Number.NaN)).toBe('尚未打满一轮');
    expect(zoneClearsText(Number.POSITIVE_INFINITY)).toBe('尚未打满一轮');
  });

  it('正数轮数 → 已通关 N 轮', () => {
    expect(zoneClearsText(1)).toBe('已通关 1 轮');
    expect(zoneClearsText(7)).toBe('已通关 7 轮');
  });

  it('边界：负数按未通关处理，小数向下取整', () => {
    expect(zoneClearsText(-3)).toBe('尚未打满一轮');
    expect(zoneClearsText(2.9)).toBe('已通关 2 轮');
  });
});

describe('idleTargetOptions（§23 G5：前端不给必败入口）', () => {
  it('只保留 idleAllowed 的秘境，并把进度/轮数拼成副文案', () => {
    const options = idleTargetOptions([
      makeZone(),
      makeZone({ code: 'zone_r6', name: '幽泉', realm: 6, tierKind: 'special', idleAllowed: false }),
    ]);
    expect(options).toEqual([
      { code: 'zone_r1', name: '青云山', realm: 1, detail: '进度 3 / 3 层 · 已通关 2 轮' },
    ]);
  });

  it('边界：空列表 / 全部不可挂机 -> 空数组', () => {
    expect(idleTargetOptions([])).toEqual([]);
    expect(idleTargetOptions([makeZone({ idleAllowed: false })])).toEqual([]);
  });

  it('边界：progress 缺失时副文案退化为 0 进度且不崩', () => {
    const options = idleTargetOptions([makeZone({ progress: undefined as never })]);
    expect(options[0]?.detail).toBe('进度 0 / 3 层 · 尚未打满一轮');
  });
});

describe('idleTargetName（§23）', () => {
  it('优先从已突破列表取名字', () => {
    expect(idleTargetName('zone_r1', [makeZone()], [])).toBe('青云山');
  });

  it('已突破列表查不到时退到突破名录（容错）', () => {
    expect(idleTargetName('zone_r1', [], [makeBreakthrough({ name: '名录青云山' })])).toBe('名录青云山');
  });

  it('边界：未设置（null / 空串）与查不到都返回 null', () => {
    expect(idleTargetName(null, [makeZone()], [makeBreakthrough()])).toBeNull();
    expect(idleTargetName('', [makeZone()], [makeBreakthrough()])).toBeNull();
    expect(idleTargetName('zone_ghost', [makeZone()], [makeBreakthrough()])).toBeNull();
  });
});
