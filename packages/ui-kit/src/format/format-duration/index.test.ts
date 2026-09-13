/**
 * formatDuration 边界：裸浮点、0、不足 1 分/1 小时、整点、超大、非法输入。
 */
import { describe, expect, it } from 'vitest';
import { formatDuration } from './index.js';

describe('formatDuration', () => {
  it('裸浮点不再泄漏到界面（原型缺陷回归）', () => {
    expect(formatDuration(2.0210366666666667)).toBe('2 小时 1 分');
  });

  it('不足 1 小时显示分钟', () => {
    expect(formatDuration(0.75)).toBe('45 分');
    expect(formatDuration(0.999)).toBe('59 分');
  });

  it('整小时省略分钟', () => {
    expect(formatDuration(1)).toBe('1 小时');
    expect(formatDuration(12)).toBe('12 小时');
    expect(formatDuration(24)).toBe('24 小时');
  });

  it('恰好 0 与不足 1 分钟分别处理', () => {
    expect(formatDuration(0)).toBe('0 分');
    expect(formatDuration(0.001)).toBe('<1 分');
    expect(formatDuration(0.016)).toBe('<1 分'); // 0.96 分钟
  });

  it('非法输入返回占位而不崩', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatDuration(Number.NEGATIVE_INFINITY)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(-0.5)).toBe('—');
  });

  it('小数分钟向下取整（不虚报时长）', () => {
    expect(formatDuration(1.999)).toBe('1 小时 59 分');
    expect(formatDuration(0.0333)).toBe('1 分'); // 1.998 分钟
  });

  it('超大值仍然可读', () => {
    expect(formatDuration(1000)).toBe('1000 小时');
    expect(formatDuration(1000.5)).toBe('1000 小时 30 分');
  });
});
