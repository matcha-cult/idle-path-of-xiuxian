/**
 * 秘境展示判定纯函数边界（§22：只剩 tier / 层数 / 通关轮数三支）。
 *
 * 旧的 `challengeBlockReason` / `prevZoneHint` 随「秘境页面只列已突破秘境」一并删除：
 * 未突破的秘境根本不下发，前端不再有任何「为什么进不去」的锁判定。
 */
import { describe, expect, it } from 'vitest';
import { zoneClearsText, zoneFloorText, zoneTierLabel } from './presentation.js';

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
