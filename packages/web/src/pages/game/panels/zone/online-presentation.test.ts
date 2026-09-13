/**
 * `online-presentation.ts` 单测（P3.0 T6 的纯逻辑）。
 *
 * 钉死边界：空帧 / `killsPerFloor=0` / 越界进度 / 非法层数 / 未知事件 / 未知 reason。
 */
import { describe, expect, it } from 'vitest';
import type { ZoneOnlineData } from '@idle-path/ionet-transport';
import {
  eventLabelOf,
  eventLabelsOf,
  floorKillsLabel,
  floorLabel,
  floorProgressPercent,
  idleUnlockedHint,
  isAdvancing,
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
    zone: { code: 'zone_houshan', name: '后山历练峰' },
    nodeCode: 'qy_peak_xunlian',
    nodeName: '第八峰·历练',
    floor: 1,
    maxFloor: 3,
    bestFloor: 0,
    cleared: false,
    isBossFloor: false,
    playerPower: 100,
    floorRequirement: 75,
    floorKills: 12,
    killsPerFloor: 30,
    stuck: false,
    shortfall: 0,
    idleUnlocked: false,
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
  it('五种 reason 各有独立文案，null 有占位', () => {
    expect(statusText(null)).toContain('尚未读取');
    expect(statusText(frame({ reason: 'ok' }))).toContain('正在历练');
    expect(statusText(frame({ reason: 'hidden' }))).toContain('后台');
    expect(statusText(frame({ reason: 'no_session' }))).toContain('连接断开');
    expect(statusText(frame({ reason: 'no_realm' }))).toContain('尚未进入秘境');
    expect(statusText(frame({ reason: 'not_map_realm' }))).toContain('不是地图上的');
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

describe('stuckText / idleUnlockedHint', () => {
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

  it('解锁引导只在 idleUnlocked 时出现', () => {
    expect(idleUnlockedHint(frame({ idleUnlocked: true }))).toContain('已解锁离线挂机');
    expect(idleUnlockedHint(frame())).toBeNull();
    expect(idleUnlockedHint(null)).toBeNull();
  });
});

describe('事件标签与产出摘要', () => {
  it('已知事件翻译成中文，未知事件丢弃（不回显协议原文）', () => {
    expect(eventLabelOf('floor_up')).toBe('涨层');
    expect(eventLabelOf('boss_floor')).toBe('进入 Boss 层');
    expect(eventLabelOf('boss_defeated')).toBe('击败 Boss');
    expect(eventLabelOf('idle_unlocked')).toBe('解锁离线挂机');
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
