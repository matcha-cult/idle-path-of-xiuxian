/**
 * `map-ring-snippet` 单测 —— 这段文本会被**直接贴回数据表**，所以逐字断言：
 * 常量名对不对、值是不是**当前值**（滑杆改过的）、有没有漏掉一环、有没有塞进不需要的行。
 *
 * 另外守住两条数据契约（漏了会让按钮静默漏掉一环）：
 * 每个**可调**环都必须标了 `radiusConst`；固定环（中心）则必须没有。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAP_RINGS, withRingRadii } from './map-points.js';
import type { MapRing } from './map-points.js';
import { copyText, formatRadius, ringRadiusSnippet } from './map-ring-snippet.js';

const exportLines = (snippet: string): string[] =>
  snippet.split('\n').filter((line) => line.startsWith('export const'));

describe('ringRadiusSnippet', () => {
  it('⭐ 生成可直接贴回数据表的常量定义（并写明贴回位置）', () => {
    const snippet = ringRadiusSnippet();
    expect(snippet).toContain('map-catalog.ts');
    expect(exportLines(snippet)).toHaveLength(3);
  });

  it('顺序沿用环表（外环 → 二环 → 内环），常量名与数据表一一对应', () => {
    expect(exportLines(ringRadiusSnippet())).toEqual([
      'export const GATE_RING_CELLS = 10;',
      'export const PEAK_RING_CELLS = 9;',
      'export const COURT_RING_CELLS = 5;',
    ]);
  });

  it('⭐ 导出的是**当前**值：滑杆改过就按改过的值生成', () => {
    const snippet = ringRadiusSnippet(withRingRadii({ gate: 14, court: 6.5 }));
    expect(snippet).toContain('export const GATE_RING_CELLS = 14;');
    expect(snippet).toContain('export const COURT_RING_CELLS = 6.5;');
    expect(snippet).toContain('export const PEAK_RING_CELLS = 9;');
  });

  it('固定环（中心）与没有 radiusConst 的环被跳过 —— 不往数据表里塞没用的行', () => {
    const rings: readonly MapRing[] = [{ key: 'x', label: 'X', radiusCells: 3 }, ...MAP_RINGS];
    expect(exportLines(ringRadiusSnippet(rings))).toHaveLength(3);
  });

  it('⭐ 每个可调环都标了常量名，固定环则没有（否则按钮会静默漏掉一环）', () => {
    for (const ring of MAP_RINGS) {
      if (ring.fixed === true) expect(ring.radiusConst).toBeUndefined();
      else expect(ring.radiusConst).toBeTypeOf('string');
    }
  });

  it('空环表 ⇒ 只剩说明行，不抛错', () => {
    expect(exportLines(ringRadiusSnippet([]))).toEqual([]);
  });
});

describe('formatRadius', () => {
  it('整数不带小数点；半格步长保留小数；浮点渣被抹平', () => {
    expect(formatRadius(10)).toBe('10');
    expect(formatRadius(9.5)).toBe('9.5');
    expect(formatRadius(6.25)).toBe('6.25');
    expect(formatRadius(6.000000001)).toBe('6');
    expect(formatRadius(Number.NaN)).toBe('0');
    expect(formatRadius(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('copyText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('剪贴板可用 ⇒ true，且原样写入', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyText('abc')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  it('没有 clipboard API（jsdom / 非安全上下文）⇒ false，不抛错', async () => {
    await expect(copyText('abc')).resolves.toBe(false);
  });

  it('写入被拒绝（用户不给权限）⇒ false，不抛错', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    await expect(copyText('abc')).resolves.toBe(false);
  });
});
