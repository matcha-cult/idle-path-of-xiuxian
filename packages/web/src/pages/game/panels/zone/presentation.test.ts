/**
 * 秘境展示判定纯函数边界。
 */
import { describe, expect, it } from 'vitest';
import { challengeBlockReason, prevZoneHint, zoneFloorText } from './presentation.js';

describe('challengeBlockReason', () => {
  it('可挑战时无原因文案', () => {
    expect(challengeBlockReason({ canChallenge: true, cleared: false, power: 30, need: 28 })).toBe('');
  });

  it('已通关优先于战力判定', () => {
    expect(challengeBlockReason({ canChallenge: false, cleared: true, power: 1, need: 999 })).toContain('已通关');
  });

  it('战力不足时给出差额', () => {
    expect(challengeBlockReason({ canChallenge: false, cleared: false, power: 25, need: 28 })).toBe('战力不足：还差 3');
  });

  it('战力为小数时差额不出现负号（Math.max 兜底）', () => {
    expect(challengeBlockReason({ canChallenge: false, cleared: false, power: 27.5, need: 28 })).toBe('战力不足：还差 0.5');
    expect(challengeBlockReason({ canChallenge: false, cleared: false, power: -5, need: 10 })).toBe('战力不足：还差 15');
  });

  it('既非通关也非战力不足时给兜底文案', () => {
    expect(challengeBlockReason({ canChallenge: false, cleared: false, power: 100, need: 10 })).toBe('当前无法挑战');
  });
});

describe('zoneFloorText', () => {
  it('正常拼接', () => {
    expect(zoneFloorText(4, 10)).toBe('进度 4 / 10 层');
  });

  it('bestFloor 缺失或非有限时按 0', () => {
    expect(zoneFloorText(undefined, 10)).toBe('进度 0 / 10 层');
    expect(zoneFloorText(Number.NaN, 10)).toBe('进度 0 / 10 层');
  });

  it('maxFloor 非有限时不显示 NaN', () => {
    expect(zoneFloorText(2, Number.NaN)).toBe('进度 2 / 0 层');
  });
});

describe('prevZoneHint', () => {
  it('无前置秘境名时只给层数', () => {
    expect(prevZoneHint(null, 5, 0)).toBe('需先推进前置秘境至第 5 层');
  });

  it('有前置秘境名时给出对比', () => {
    expect(prevZoneHint('青云山脚', 5, 3)).toBe('需先推进「青云山脚」至第 5 层（当前最高 3 层）');
  });
});
