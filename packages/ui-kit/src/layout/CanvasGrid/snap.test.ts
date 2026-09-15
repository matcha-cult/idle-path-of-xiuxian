/**
 * `snapLine` 单测 —— 钉住的是「对齐后的线**确实横跨整数个设备像素**」这条几何事实，
 * 而不是某些具体数字：那条性质才是"清晰"的定义，也是重构最容易破坏的东西。
 */
import { describe, expect, it } from 'vitest';
import { HAIRLINE_PX, snapLine } from './snap.js';

/** 设备像素宽：与实现同一口径（用于独立验算，不直接调用私有逻辑）。 */
const deviceWidthOf = (widthCssPx: number, dpr: number): number =>
  Math.max(1, Math.round(widthCssPx * dpr));

/**
 * "整数"要带容差：`(m + w/2) / dpr × dpr` 会带上除法/乘法的浮点尾数
 * （如 30.5 / 3 × 3 = 30.499999999999996），用 `Number.isInteger` 会误报。
 */
const isIntegerish = (value: number): boolean => Math.abs(value - Math.round(value)) < 1e-9;

describe('snapLine', () => {
  it('dpr=1 的 1px 线落在整数 + 0.5 上（经典的半像素对齐）', () => {
    expect(snapLine(5, 1)).toBe(5.5);
    expect(snapLine(5.4, 1)).toBe(5.5);
    expect(snapLine(5.6, 1)).toBe(5.5); // 5.5 比 6.5 更近
    expect(HAIRLINE_PX).toBe(1);
  });

  it('dpr=2 的 1px 线落在**整数**上（2 个设备像素宽 ⇒ 整数边界）', () => {
    expect(snapLine(5, 2)).toBe(5);
    expect(snapLine(10.3, 2)).toBe(10.5);
    expect(snapLine(10.8, 2)).toBe(11);
  });

  it('dpr=3 的 1px 线落回半像素（3 个设备像素宽，奇偶决定落点）', () => {
    expect(isIntegerish(snapLine(10, 3) * 3 - 1.5)).toBe(true);
  });

  it('⭐ 任意 dpr / 宽度下：两端都落在整数设备像素边界（这条性质才是"清晰"）', () => {
    for (const dpr of [1, 1.5, 2, 3, 4]) {
      for (const width of [1, 2, 3]) {
        const deviceWidth = deviceWidthOf(width, dpr);
        for (const pos of [-13.7, -0.2, 0, 0.5, 26, 26.31, 99.999]) {
          const device = snapLine(pos, dpr, width) * dpr;
          expect(isIntegerish(device - deviceWidth / 2)).toBe(true);
          expect(isIntegerish(device + deviceWidth / 2)).toBe(true);
        }
      }
    }
  });

  it('⭐ 位移上界是半个设备像素（不会把几何带偏，缩放锚点因此不受影响）', () => {
    for (const dpr of [1, 2, 3]) {
      for (let pos = -20; pos <= 20; pos += 0.05) {
        expect(Math.abs(snapLine(pos, dpr) - pos)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
      }
    }
  });

  it('负数与小数同样成立（网格可被拖到视口外）', () => {
    expect(isIntegerish(snapLine(-13.7, 2) * 2 - 1)).toBe(true);
    expect(Math.abs(snapLine(-13.7, 1) - -13.7)).toBeLessThanOrEqual(0.5);
  });

  it('非法输入降级：NaN 原样返回；dpr ≤ 0 / NaN 按 1；宽度 ≤ 0 / NaN 按 1px', () => {
    expect(snapLine(Number.NaN, 2)).toBeNaN();
    expect(snapLine(5, 0)).toBe(snapLine(5, 1));
    expect(snapLine(5, Number.NaN)).toBe(snapLine(5, 1));
    expect(snapLine(5, 2, 0)).toBe(snapLine(5, 2, 1));
    expect(snapLine(5, 2, Number.NaN)).toBe(snapLine(5, 2, 1));
  });

  it('2px 线在 dpr=1 下落在整数上（宽度也参与奇偶判断）', () => {
    expect(snapLine(10, 1, 2)).toBe(10);
    expect(snapLine(10.4, 1, 2)).toBe(10);
  });
});
