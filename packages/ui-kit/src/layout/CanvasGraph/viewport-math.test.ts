/**
 * `viewport-math` 单测 —— 纯公式层，全部按**边界**断言：
 * 非法数（NaN / Infinity）、零尺寸、退化锚点、恰好落在阈值上、夹取上下界。
 */
import { describe, expect, it } from 'vitest';
import {
  INERTIA_MAX_SPEED,
  INERTIA_MIN_SPEED,
  PINCH_WHEEL_ZOOM_STEP,
  PINCH_MIN_DISTANCE_PX,
  WHEEL_ZOOM_STEP,
  clampPose,
  decaySpeed,
  fitPose,
  lerpPose,
  pinchScale,
  poseSettled,
  zoomAtPoint,
  zoomFactorFromWheel,
} from './viewport-math.js';
import type { PoseBounds } from './viewport-math.js';

const bounds = (over: Partial<PoseBounds> = {}): PoseBounds => ({
  worldW: 1056,
  worldH: 1056,
  viewW: 528,
  viewH: 528,
  minZoom: 0.5,
  maxZoom: 2,
  ...over,
});

describe('fitPose', () => {
  it('整图适配并居中：zoom 取短边比，pan 把世界摆在正中', () => {
    const pose = fitPose(1056, 1056, 528, 528);
    expect(pose.zoom).toBeCloseTo(0.5);
    expect(pose.panX).toBeCloseTo(0);
    expect(pose.panY).toBeCloseTo(0);
  });

  it('非正方形容器：短边决定 zoom，长边留白居中', () => {
    const pose = fitPose(100, 100, 400, 200);
    expect(pose.zoom).toBeCloseTo(2);
    expect(pose.panX).toBeCloseTo(100);
    expect(pose.panY).toBeCloseTo(0);
  });

  it('容器尺寸为 0 / NaN → 回退 zoom=1，绝不产出 NaN', () => {
    for (const size of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const pose = fitPose(100, 100, size, size);
      expect(Number.isFinite(pose.zoom)).toBe(true);
      expect(Number.isFinite(pose.panX)).toBe(true);
      expect(Number.isFinite(pose.panY)).toBe(true);
    }
  });
});

describe('clampPose', () => {
  it('zoom 夹到 [minZoom, maxZoom]', () => {
    expect(clampPose({ zoom: 99, panX: 0, panY: 0 }, bounds()).zoom).toBe(2);
    expect(clampPose({ zoom: 0.001, panX: 0, panY: 0 }, bounds()).zoom).toBe(0.5);
  });

  it('pan 夹取后仍能看见图的一角（不允许把整张图拖出视野）', () => {
    const far = clampPose({ zoom: 1, panX: 99999, panY: -99999 }, bounds());
    expect(far.panX).toBeLessThanOrEqual(40);
    expect(far.panY).toBeGreaterThanOrEqual(-(1056 - 40));
  });

  it('NaN 位姿收敛到安全值', () => {
    const pose = clampPose({ zoom: Number.NaN, panX: Number.NaN, panY: Number.NaN }, bounds());
    expect(Number.isFinite(pose.zoom)).toBe(true);
    expect(Number.isFinite(pose.panX)).toBe(true);
    expect(Number.isFinite(pose.panY)).toBe(true);
  });
});

describe('zoomAtPoint（锚点缩放）', () => {
  it('锚点下的世界坐标在缩放前后不动', () => {
    const before = { zoom: 1, panX: 10, panY: 20 };
    const anchorX = 123;
    const anchorY = 77;
    const worldX = (anchorX - before.panX) / before.zoom;
    const after = zoomAtPoint(before, anchorX, anchorY, 1.8, bounds());
    const worldXAfter = (anchorX - after.panX) / after.zoom;
    expect(worldXAfter).toBeCloseTo(worldX, 6);
  });

  it('zoom 不变 → 位姿原样返回（不产生浮点漂移）', () => {
    const before = { zoom: 1, panX: 10, panY: 20 };
    const after = zoomAtPoint(before, 100, 100, 1, bounds());
    expect(after).toEqual(before);
  });

  it('旧 zoom 非法（0）时不清空 pan', () => {
    const after = zoomAtPoint({ zoom: 0, panX: 5, panY: 6 }, 100, 100, 1, bounds());
    expect(Number.isFinite(after.panX)).toBe(true);
    expect(Number.isFinite(after.panY)).toBe(true);
  });

  it('请求超过 maxZoom 时按 maxZoom 落位', () => {
    const after = zoomAtPoint({ zoom: 1, panX: 0, panY: 0 }, 0, 0, 999, bounds({ maxZoom: 1.5 }));
    expect(after.zoom).toBe(1.5);
  });
});

describe('zoomFactorFromWheel', () => {
  it('向上滚 = 放大，向下滚 = 缩小', () => {
    expect(zoomFactorFromWheel(-100, false)).toBeCloseTo(WHEEL_ZOOM_STEP);
    expect(zoomFactorFromWheel(100, false)).toBeCloseTo(1 / WHEEL_ZOOM_STEP);
  });

  it('ctrl/⌘ + 滚轮（触控板捏合）步进更细', () => {
    const pinch = zoomFactorFromWheel(-100, true);
    expect(pinch).toBeCloseTo(PINCH_WHEEL_ZOOM_STEP);
    expect(pinch).toBeLessThan(WHEEL_ZOOM_STEP);
  });

  it('deltaY 为 0 / NaN → 仍返回有限倍率（不放大也不缩没的边界）', () => {
    expect(zoomFactorFromWheel(0, false)).toBeCloseTo(1 / WHEEL_ZOOM_STEP);
    expect(Number.isFinite(zoomFactorFromWheel(Number.NaN, false))).toBe(true);
  });
});

describe('pinchScale', () => {
  it('两指距离翻倍 → 放大一倍', () => {
    expect(pinchScale(100, 200)).toBeCloseTo(2);
  });

  it('距离过近（< 阈值）→ 回 1，不缩放（防除零 / 抖动）', () => {
    expect(pinchScale(PINCH_MIN_DISTANCE_PX - 1, 200)).toBe(1);
    expect(pinchScale(200, 1)).toBe(1);
  });

  it('NaN / 0 → 回 1', () => {
    expect(pinchScale(Number.NaN, 100)).toBe(1);
    expect(pinchScale(0, 0)).toBe(1);
  });
});

describe('lerpPose / poseSettled', () => {
  it('按比例逼近目标', () => {
    const mid = lerpPose({ zoom: 1, panX: 0, panY: 0 }, { zoom: 2, panX: 100, panY: 50 }, 0.5);
    expect(mid).toEqual({ zoom: 1.5, panX: 50, panY: 25 });
  });

  it('ratio 越界 / NaN → 夹到合法范围（0 → 原地，NaN → 缺省比例）', () => {
    const current = { zoom: 1, panX: 0, panY: 0 };
    const target = { zoom: 2, panX: 100, panY: 0 };
    expect(lerpPose(current, target, -1)).toEqual(current);
    expect(lerpPose(current, target, 5)).toEqual(target);
    const nan = lerpPose(current, target, Number.NaN);
    expect(nan.zoom).toBeGreaterThan(1);
    expect(nan.zoom).toBeLessThan(2);
  });

  it('收敛判定：差距大 → false，完全一致 → true', () => {
    expect(poseSettled({ zoom: 1, panX: 0, panY: 0 }, { zoom: 2, panX: 0, panY: 0 })).toBe(false);
    expect(poseSettled({ zoom: 2, panX: 1, panY: 2 }, { zoom: 2, panX: 1, panY: 2 })).toBe(true);
  });
});

describe('decaySpeed（惯性衰减）', () => {
  it('每帧按摩擦衰减', () => {
    expect(decaySpeed(1)).toBeLessThan(1);
  });

  it('速度上限被夹住（甩一下不该把图甩没）', () => {
    expect(Math.abs(decaySpeed(1e9))).toBeLessThanOrEqual(INERTIA_MAX_SPEED);
  });

  it('低于阈值归零（否则会无限滑）', () => {
    expect(decaySpeed(INERTIA_MIN_SPEED / 2)).toBe(0);
  });

  it('NaN / Infinity → 0', () => {
    expect(decaySpeed(Number.NaN)).toBe(0);
    expect(decaySpeed(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
