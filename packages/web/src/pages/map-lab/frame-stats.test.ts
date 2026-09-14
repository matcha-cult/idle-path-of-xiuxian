/**
 * `frame-stats` 单测 —— 统计口径的边界。这块读数是给人看「卡不卡」的，所以
 * **宁可显示 0 也不能显示 NaN**：一次异常读数把整块读数变成 `NaN`，比不显示还糟。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW, EMPTY_SUMMARY, SLOW_FRAME_MS, pushFrame, summarizeFrames } from './frame-stats.js';

describe('summarizeFrames', () => {
  it('稳定 60Hz（16.7ms）→ 0 掉帧、约 60 FPS', () => {
    const summary = summarizeFrames(Array.from({ length: 60 }, () => 16.7));
    expect(summary.frames).toBe(60);
    expect(summary.dropped).toBe(0);
    expect(summary.fps).toBeCloseTo(59.88, 1);
    expect(summary.worstMs).toBeCloseTo(16.7);
  });

  it('掉帧判定边界：恰好等于阈值**不算**掉帧，超出一点就算', () => {
    expect(summarizeFrames([SLOW_FRAME_MS]).dropped).toBe(0);
    expect(summarizeFrames([SLOW_FRAME_MS + 0.001]).dropped).toBe(1);
  });

  it('fps 由**平均**折算，不被一次抖动拖垮（最差帧单独报）', () => {
    const summary = summarizeFrames([16, 16, 16, 400]);
    expect(summary.worstMs).toBe(400);
    expect(summary.dropped).toBe(1);
    // 平均 112ms ⇒ 约 8.9 FPS，绝不是 1/0.4 = 2.5 FPS
    expect(summary.fps).toBeGreaterThan(8);
  });

  it('空窗口 → EMPTY_SUMMARY（不是 NaN 读数）', () => {
    expect(summarizeFrames([])).toEqual(EMPTY_SUMMARY);
  });

  it('非法间隔被跳过：NaN / Infinity / 负数都不污染统计', () => {
    const summary = summarizeFrames([Number.NaN, 16, Number.POSITIVE_INFINITY, -5, 16]);
    expect(summary.frames).toBe(2);
    expect(Number.isFinite(summary.avgMs)).toBe(true);
    expect(summary.avgMs).toBeCloseTo(16);
    expect(summary.worstMs).toBeCloseTo(16);
  });

  it('全非法 → EMPTY_SUMMARY', () => {
    expect(summarizeFrames([Number.NaN, Number.NEGATIVE_INFINITY])).toEqual(EMPTY_SUMMARY);
  });

  it('平均间隔为 0（同一毫秒内连来两帧）→ fps 记 0，不是 Infinity', () => {
    const summary = summarizeFrames([0, 0]);
    expect(summary.fps).toBe(0);
    expect(Number.isFinite(summary.fps)).toBe(true);
  });

  it('非法阈值回退到缺省，而不是「一切都不算掉帧」', () => {
    expect(summarizeFrames([25], Number.NaN).dropped).toBe(1);
    expect(summarizeFrames([25], 0).dropped).toBe(1);
    expect(summarizeFrames([25], -1).dropped).toBe(1);
  });
});

describe('pushFrame（滑动窗口）', () => {
  it('追加并保持顺序', () => {
    expect(pushFrame([1, 2], 3, 10)).toEqual([1, 2, 3]);
  });

  it('超出窗口长度 → 丢最旧的（只看最近的操作）', () => {
    let deltas: number[] = [];
    for (let i = 1; i <= 5; i += 1) deltas = pushFrame(deltas, i, 3);
    expect(deltas).toEqual([3, 4, 5]);
  });

  it('非法值不进入窗口，但仍裁剪（窗口不会无限增长）', () => {
    let deltas: number[] = [1, 2, 3, 4];
    deltas = pushFrame(deltas, Number.NaN, 2);
    expect(deltas).toEqual([3, 4]);
  });

  it('非法窗口长度回退到缺省（不会变成 0 长窗口把数据全丢光）', () => {
    expect(pushFrame([1], 2, Number.NaN)).toEqual([1, 2]);
    expect(pushFrame([1], 2, 0)).toEqual([1, 2]);
    expect(DEFAULT_WINDOW).toBeGreaterThan(1);
  });

  it('返回值是新数组（不改入参 —— React 里靠引用变化驱动重渲染）', () => {
    const before = [1, 2, 3];
    const after = pushFrame(before, 4, 10);
    expect(after).not.toBe(before);
    expect(before).toEqual([1, 2, 3]);
  });
});
