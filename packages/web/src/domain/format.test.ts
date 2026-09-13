/**
 * formatCompactNumber / formatCount 边界。
 */
import { describe, expect, it } from 'vitest';
import { formatCompactNumber, formatCount } from './format.js';

describe('formatCompactNumber', () => {
  it('万以下按整数展示', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(41)).toBe('41');
    expect(formatCompactNumber(9999)).toBe('9999');
  });

  it('万级压缩并去掉多余 .0', () => {
    expect(formatCompactNumber(10000)).toBe('1 万');
    expect(formatCompactNumber(12345)).toBe('1.2 万');
    expect(formatCompactNumber(99999)).toBe('10 万');
  });

  it('亿级压缩', () => {
    expect(formatCompactNumber(1e8)).toBe('1 亿');
    expect(formatCompactNumber(1.5e8)).toBe('1.5 亿');
    expect(formatCompactNumber(123456789)).toBe('1.2 亿');
  });

  it('负数保留符号', () => {
    expect(formatCompactNumber(-12345)).toBe('-1.2 万');
    expect(formatCompactNumber(-999)).toBe('-999');
  });

  it('非法输入返回占位', () => {
    expect(formatCompactNumber(Number.NaN)).toBe('—');
    expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCompactNumber(Number.NEGATIVE_INFINITY)).toBe('—');
  });

  it('小数向下取整（不虚报数量）', () => {
    expect(formatCompactNumber(41.9)).toBe('41');
  });
});

describe('formatCount', () => {
  it('小数值原样（取整）', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7.8)).toBe('7');
  });

  it('非法输入返回占位', () => {
    expect(formatCount(Number.NaN)).toBe('—');
  });
});
