/**
 * GraphCanvas 纯几何：适配缩放 / 夹取 / 锚点缩放 / 枢纽屏幕位置 / 轴标索引。
 *
 * 这一层的意义是「绝不产出 NaN」—— NaN 坐标会让整块画布静默消失，没有报错可查，
 * 所以边界（0 / 负数 / NaN / Infinity / 非法 cellPx）全部写成断言。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CELL_PX,
  MAX_ZOOM_FACTOR,
  axisIndexes,
  clampPan,
  clampZoom,
  coordinateLabel,
  finite,
  fitZoom,
  isRenderableItem,
  itemScreenPosition,
  safeCellPx,
  worldSize,
  zoomAt,
} from './geometry.js';

describe('finite / safeCellPx', () => {
  it('非有限数一律回退缺省', () => {
    expect(finite(undefined, 7)).toBe(7);
    expect(finite(Number.NaN, 7)).toBe(7);
    expect(finite(Number.POSITIVE_INFINITY, 7)).toBe(7);
    expect(finite('3', 7)).toBe(3);
    expect(finite(0, 7)).toBe(0);
  });

  it('cellPx 非法（0 / 负 / NaN / undefined）回退 48', () => {
    expect(safeCellPx(undefined)).toBe(DEFAULT_CELL_PX);
    expect(safeCellPx(0)).toBe(DEFAULT_CELL_PX);
    expect(safeCellPx(-10)).toBe(DEFAULT_CELL_PX);
    expect(safeCellPx(Number.NaN)).toBe(DEFAULT_CELL_PX);
    expect(safeCellPx(24)).toBe(24);
  });
});

describe('worldSize / fitZoom / clampZoom', () => {
  it('世界尺寸 = (n+1) × cellPx；n 非法时至少 1 格', () => {
    expect(worldSize(21, 48)).toBe(22 * 48);
    expect(worldSize(0, 48)).toBe(48);
    expect(worldSize(-5, 48)).toBe(48);
    expect(worldSize(Number.NaN, 48)).toBe(48);
    expect(worldSize(3.9, 10)).toBe(40);
  });

  it('fitZoom 取宽高比的较小者；容器为 0 → 回退 1（不缩没）', () => {
    expect(fitZoom(1000, 500, 500, 500)).toBeCloseTo(0.5);
    expect(fitZoom(500, 1000, 500, 500)).toBeCloseTo(0.5);
    expect(fitZoom(1056, 1056, 660, 660)).toBeCloseTo(0.625);
    expect(fitZoom(1056, 1056, 0, 0)).toBe(1);
    expect(fitZoom(1056, 1056, Number.NaN, 100)).toBe(1);
  });

  it('clampZoom 夹取；上下界非法时回退', () => {
    expect(clampZoom(0.1, 0.5, 2)).toBe(0.5);
    expect(clampZoom(9, 0.5, 2)).toBe(2);
    expect(clampZoom(1, 0.5, 2)).toBe(1);
    expect(clampZoom(Number.NaN, 0.5, 2)).toBe(1);
    // maxZoom < minZoom 时按 minZoom 处理（不返回 NaN）
    expect(clampZoom(1, 2, 1)).toBe(2);
    expect(MAX_ZOOM_FACTOR).toBeGreaterThan(1);
  });
});

describe('clampPan / zoomAt', () => {
  it('平移允许露出一部分，但不允许整图被拖出视野', () => {
    // 世界 2200px（图很大的场景）：最多拖到只剩 40px 可见
    expect(clampPan(0, 2200, 1)).toBe(0);
    expect(clampPan(-5000, 2200, 1)).toBe(-(2200 - 40));
    expect(clampPan(5000, 2200, 1)).toBe(40);
    // 世界比「最小可见量」还小时不收窄
    expect(clampPan(5000, 20, 1)).toBe(20);
    // 非法输入回退 0
    expect(clampPan(Number.NaN, 2200, 1)).toBe(0);
    expect(clampPan(10, 0, 1)).toBe(0);
  });

  it('zoomAt 保持锚点在屏幕上的位置', () => {
    // 锚点 100、旧 pan 0、zoom 1→2：新 pan 应让同一个世界点在屏幕上仍落于 100
    expect(zoomAt(0, 100, 1, 2)).toBe(-100);
    // 旧 zoom 非法 → 平移不变
    expect(zoomAt(50, 100, 0, 2)).toBe(50);
    expect(zoomAt(50, 100, Number.NaN, 2)).toBe(50);
  });
});

describe('itemScreenPosition / 开发者网格辅助', () => {
  it('枢纽位置 = 坐标 × cellPx × zoom + pan（图标自身不缩）', () => {
    expect(itemScreenPosition(2, 3, 48, 1, 10, 20)).toEqual({ x: 3 * 48 + 10, y: 2 * 48 + 20 });
    // zoom 只作用于坐标，不作用于图标尺寸
    expect(itemScreenPosition(2, 3, 48, 0.5, 0, 0)).toEqual({ x: 72, y: 48 });
    // 非法输入不产出 NaN
    const safe = itemScreenPosition(Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN);
    expect(Number.isFinite(safe.x)).toBe(true);
    expect(Number.isFinite(safe.y)).toBe(true);
  });

  it('isRenderableItem：坐标必须有限（越界仍渲染，交给裁剪）', () => {
    expect(isRenderableItem(0, 0)).toBe(true);
    expect(isRenderableItem(999, -3)).toBe(true);
    expect(isRenderableItem(Number.NaN, 1)).toBe(false);
    expect(isRenderableItem(1, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('axisIndexes 是 0-based 且含两端：n → [0..n]', () => {
    expect(axisIndexes(3)).toEqual([0, 1, 2, 3]);
    expect(axisIndexes(0)).toEqual([0]);
    expect(axisIndexes(-2)).toEqual([0]);
    expect(axisIndexes(Number.NaN)).toEqual([0]);
    expect(axisIndexes(21)).toHaveLength(22);
  });

  it('coordinateLabel 输出「行,列」（整数、非有限回退 0）', () => {
    expect(coordinateLabel(8, 12)).toBe('8,12');
    expect(coordinateLabel(3.9, 4.2)).toBe('3,4');
    expect(coordinateLabel(Number.NaN, Number.NaN)).toBe('0,0');
  });
});
