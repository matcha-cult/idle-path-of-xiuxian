/**
 * `online-presentation.ts` 单测（P3.0 T6 纯逻辑；§22 修订）。
 *
 * 钉死边界：空帧 / `killsPerFloor=0` / 越界进度 / 非法层数 / 未知事件 / 未知 reason。
 * §22 变化：reason 只剩 ok|hidden|no_session|no_battle；事件是 `realm_unlocked`；
 * 突破引导 `realmUnlockedHint` 基于稳定状态（no_battle + clears≥1）而非瞬时事件。
 */
import { describe, expect, it } from 'vitest';
import type { ZoneOnlineData } from '@idle-path/ionet-transport';
import {
  eventLabelOf,
  eventLabelsOf,
  floorKillsLabel,
  floorLabel,
  floorProgressPercent,
  isAdvancing,
  realmUnlockedHint,
  rhythmText,
  statusText,
  stuckText,
  summaryText,
} from './online-presentation.js';

function frame(overrides: Partial<ZoneOnlineData> = {}): ZoneOnlineData {
  return {
    online: true,
    exploring: true,
    reason: 'ok',
    zone: { code: 'zone_r4', name: '后山兽潮', realm: 4 },
    floor: 1,
    maxFloor: 3,
    bestFloor: 0,
    cleared: false,
    clears: 0,
    isBossFloor: false,
    playerPower: 100,
    floorRequirement: 75,
    floorKills: 12,
    killsPerFloor: 30,
    stuck: false,
    shortfall: 0,
    kills: 0,
    lingyunGained: 0,
    events: [],
    tickMs: 1000,
    pushEveryMs: 3000,
    ...overrides,
  };
}

describe('isAdvancing', () => {
  it('在线 + 在秘境峰 + reason=ok 才算推进', () => {
    expect(isAdvancing(frame())).toBe(true);
    expect(isAdvancing(null)).toBe(false);
    expect(isAdvancing(frame({ online: false }))).toBe(false);
    expect(isAdvancing(frame({ exploring: false }))).toBe(false);
    expect(isAdvancing(frame({ reason: 'hidden' }))).toBe(false);
  });
});

describe('floorProgressPercent', () => {
  it('常规百分比取整', () => {
    expect(floorProgressPercent(frame({ floorKills: 12, killsPerFloor: 30 }))).toBe(40);
    expect(floorProgressPercent(frame({ floorKills: 0 }))).toBe(0);
    expect(floorProgressPercent(frame({ floorKills: 30 }))).toBe(100);
  });

  it('越界夹到 0~100（服务端已涨层但帧在途的窗口）', () => {
    expect(floorProgressPercent(frame({ floorKills: 45 }))).toBe(100);
    expect(floorProgressPercent(frame({ floorKills: -5 }))).toBe(0);
  });

  it('边界：killsPerFloor=0 / 负数 / 非有限 → 0（不产生 NaN 宽度）', () => {
    expect(floorProgressPercent(null)).toBe(0);
    expect(floorProgressPercent(frame({ killsPerFloor: 0 }))).toBe(0);
    expect(floorProgressPercent(frame({ killsPerFloor: -3 }))).toBe(0);
    expect(floorProgressPercent(frame({ killsPerFloor: Number.NaN }))).toBe(0);
    expect(floorProgressPercent(frame({ floorKills: Number.NaN }))).toBe(0);
    expect(floorProgressPercent(frame({ floorKills: Number.POSITIVE_INFINITY }))).toBe(0);
  });
});

describe('statusText', () => {
  it('四种 reason 各有独立文案，null 有占位', () => {
    expect(statusText(null)).toContain('尚未读取');
    expect(statusText(frame({ reason: 'ok' }))).toContain('正在历练');
    expect(statusText(frame({ reason: 'hidden' }))).toContain('后台');
    expect(statusText(frame({ reason: 'no_session' }))).toContain('连接断开');
    expect(statusText(frame({ reason: 'no_battle' }))).toContain('未在秘境中');
  });

  it('no_battle 同时给出两条入场路径（秘境石台突破 / 秘境页面重复挑战）', () => {
    const text = statusText(frame({ reason: 'no_battle', zone: null, exploring: false }));
    expect(text).toContain('秘境石台');
    expect(text).toContain('重复挑战');
  });

  it('未知 reason（服务端新增枚举）不崩、有兜底文案', () => {
    const weird = frame({ reason: 'something_new' as ZoneOnlineData['reason'] });
    expect(statusText(weird)).toBe('历练状态未知');
  });

  it('节奏文案来自服务端下发的 tickMs / pushEveryMs', () => {
    expect(statusText(frame({ tickMs: 2000 }))).toContain('每 2 秒');
    expect(rhythmText(frame({ tickMs: 1000, pushEveryMs: 3000 }))).toContain('每 1 秒结算');
    expect(rhythmText(frame({ tickMs: 1000, pushEveryMs: 3000 }))).toContain('每 3 秒推送');
    expect(rhythmText(null)).toBe('');
  });
});

describe('floorLabel / floorKillsLabel', () => {
  it('「第 N / M 层」；maxFloor 非法时退化', () => {
    expect(floorLabel(frame({ floor: 2, maxFloor: 3 }))).toBe('第 2 / 3 层');
    expect(floorLabel(frame({ floor: 4, maxFloor: 3 }))).toBe('第 3 / 3 层');
    expect(floorLabel(frame({ floor: 1, maxFloor: 0 }))).toBe('第 1 层');
    expect(floorLabel(null)).toBe('—');
  });

  it('floor<=0 / 非有限 → 占位符（绝不显示「第 0 层」）', () => {
    expect(floorLabel(frame({ floor: 0, maxFloor: 3 }))).toBe('—');
    expect(floorLabel(frame({ floor: -1 }))).toBe('—');
    expect(floorLabel(frame({ floor: Number.NaN }))).toBe('—');
  });

  it('本层击杀文案', () => {
    expect(floorKillsLabel(frame({ floorKills: 12, killsPerFloor: 30 }))).toBe('12 / 30');
    expect(floorKillsLabel(null)).toBe('—');
  });
});

describe('stuckText / realmUnlockedHint', () => {
  it('卡层提示用服务端的 shortfall，不重算门槛', () => {
    expect(stuckText(frame({ stuck: true, shortfall: 7, playerPower: 80, floorRequirement: 87 }))).toBe(
      '战力不足，还差 7（仍在原地刷本层，有产出、无进度）',
    );
    expect(stuckText(frame({ stuck: false }))).toBeNull();
    expect(stuckText(null)).toBeNull();
  });

  it('边界：负数 / 非有限 shortfall 一律显示 0，不出现「还差 NaN」', () => {
    expect(stuckText(frame({ stuck: true, shortfall: -5 }))).toContain('还差 0');
    expect(stuckText(frame({ stuck: true, shortfall: Number.NaN }))).toContain('还差 0');
  });

  it('突破引导：reason=no_battle 且 clears≥1 才出现，文案给出两条去向', () => {
    const hint = realmUnlockedHint(frame({ reason: 'no_battle', exploring: false, cleared: true, clears: 1 }));
    expect(hint).toContain('后山兽潮');
    expect(hint).toContain('已突破');
    expect(hint).toContain('重复挑战');
    expect(hint).toContain('挂机点');
  });

  it('边界：战斗中（ok）不显示；未突破（clears=0 / 缺失 / 非有限）不显示；null 不显示', () => {
    expect(realmUnlockedHint(frame({ clears: 1 }))).toBeNull();
    expect(realmUnlockedHint(frame({ reason: 'no_battle', clears: 0 }))).toBeNull();
    expect(realmUnlockedHint(frame({ reason: 'no_battle', clears: Number.NaN }))).toBeNull();
    expect(realmUnlockedHint(null)).toBeNull();
  });

  it('zone 为 null 时用「该秘境」兜底，不崩', () => {
    expect(realmUnlockedHint(frame({ reason: 'no_battle', zone: null, clears: 2 }))).toContain('该秘境');
  });
});

describe('事件标签与产出摘要', () => {
  it('已知事件翻译成中文，未知事件丢弃（不回显协议原文）', () => {
    expect(eventLabelOf('floor_up')).toBe('涨层');
    expect(eventLabelOf('boss_floor')).toBe('进入 Boss 层');
    expect(eventLabelOf('boss_defeated')).toBe('击败 Boss');
    expect(eventLabelOf('realm_unlocked')).toBe('突破成功');
    expect(eventLabelOf('stuck')).toBe('战力不足');
    expect(eventLabelOf('mystery_event')).toBeNull();
    expect(eventLabelsOf(frame({ events: ['floor_up', 'mystery_event' as never, 'stuck'] }))).toEqual([
      '涨层',
      '战力不足',
    ]);
    expect(eventLabelsOf(null)).toEqual([]);
  });

  it('产出摘要：读接口（kills=0）不显示；推送帧显示求和结果', () => {
    expect(summaryText(frame({ kills: 0 }))).toBeNull();
    expect(summaryText(null)).toBeNull();
    expect(summaryText(frame({ kills: 4, lingyunGained: 12 }))).toBe('本次 +4 击杀 · +12 灵韵');
  });

  it('边界：lingyunGained 非有限 → 显示 0', () => {
    expect(summaryText(frame({ kills: 1, lingyunGained: Number.NaN }))).toBe('本次 +1 击杀 · +0 灵韵');
  });
});
