/**
 * `pose-store` 单测 —— 位姿状态机的**时序行为**（这些是「手感」的可断言部分）：
 * 拖动是否真的跟手（current 与 target 一起写）、缩放是不是逐帧逼近、
 * 惯性会不会滑停、`freeze` 能不能掐掉上一段动画。
 */
import { describe, expect, it } from 'vitest';
import { createPoseStore } from './pose-store.js';
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

/** 一直 step 到收敛（带帧数上限，防「永不收敛」把测试挂死）。 */
function runToSettle(
  store: ReturnType<typeof createPoseStore>,
  b: PoseBounds,
  maxFrames = 600,
): { frames: number; pose: { zoom: number; panX: number; panY: number } } {
  for (let i = 0; i < maxFrames; i += 1) {
    const step = store.step(b);
    if (step.settled) return { frames: i + 1, pose: step.pose };
  }
  throw new Error(`未在 ${maxFrames} 帧内收敛`);
}

describe('fit / 初始位姿', () => {
  it('fit 之后 current 与 target 一致（打开时没有动画在跑）', () => {
    const store = createPoseStore();
    store.fit(bounds());
    expect(store.pose()).toEqual(store.aim());
    expect(store.pose().zoom).toBeCloseTo(0.5);
  });

  it('fit 后 step 一帧即 settled（无事可做不要空转 rAF）', () => {
    const store = createPoseStore();
    store.fit(bounds());
    expect(store.step(bounds()).settled).toBe(true);
  });
});

describe('拖动（dragTo）', () => {
  it('**跟手**：current 与 target 一起写，不存在插值延迟', () => {
    const store = createPoseStore();
    store.fit(bounds()); // zoom 0.5, pan 0
    store.dragTo(bounds(), 0, 0, 30, -20);
    expect(store.pose()).toEqual({ zoom: 0.5, panX: 30, panY: -20 });
    expect(store.aim()).toEqual(store.pose());
  });

  it('拖动被夹取：拖到 100 万像素也不会把图拖出视野', () => {
    const store = createPoseStore();
    store.fit(bounds());
    const pose = store.dragTo(bounds(), 0, 0, 1_000_000, -1_000_000);
    expect(pose.panX).toBeLessThanOrEqual(40);
    expect(pose.panY).toBeGreaterThanOrEqual(-(1056 * pose.zoom - 40));
    expect(Number.isFinite(pose.panX)).toBe(true);
  });
});

describe('缩放（zoomTo + step）', () => {
  it('zoomTo 只改 target；current 要逐帧逼近（= 平滑缩放，旧实现是离散跳变）', () => {
    const store = createPoseStore();
    store.fit(bounds());
    const before = store.pose().zoom;
    store.zoomTo(bounds(), 2, 0, 0);
    expect(store.pose().zoom).toBe(before); // 尚未提交
    expect(store.aim().zoom).toBeCloseTo(before * 2);
    const step = store.step(bounds());
    expect(step.settled).toBe(false); // 中间帧不可提交
    expect(step.pose.zoom).toBeGreaterThan(before);
    expect(step.pose.zoom).toBeLessThan(before * 2);
  });

  it('收敛那一帧才 settled=true，且 current 精确等于 target', () => {
    const store = createPoseStore();
    store.fit(bounds());
    store.zoomTo(bounds(), 2, 0, 0);
    const { frames, pose } = runToSettle(store, bounds());
    expect(frames).toBeGreaterThan(1); // 不是一帧到位（否则就是突跳）
    expect(frames).toBeLessThan(60); // 也不该拖到半秒以上
    expect(pose).toEqual(store.aim());
  });

  it('缩放被 maxZoom 夹住（相对 zoom_fit 的倍率上限）', () => {
    const store = createPoseStore();
    store.fit(bounds());
    for (let i = 0; i < 50; i += 1) store.zoomTo(bounds(), 2, 0, 0);
    runToSettle(store, bounds());
    expect(store.pose().zoom).toBeCloseTo(2);
  });

  it('锚点缩放：缩放前后锚点下的世界坐标不变', () => {
    const store = createPoseStore();
    store.fit(bounds({ viewW: 1056, viewH: 1056 })); // zoom 1, pan 0
    const anchor = 300;
    store.zoomTo(bounds({ viewW: 1056, viewH: 1056 }), 1.5, anchor, 0);
    runToSettle(store, bounds({ viewW: 1056, viewH: 1056 }));
    const pose = store.pose();
    expect((anchor - pose.panX) / pose.zoom).toBeCloseTo(anchor / 1, 4);
  });
});

describe('惯性（coast + step）', () => {
  it('松手后 pan 继续走（不是立即停），最终滑停并 settled', () => {
    const store = createPoseStore();
    const b = bounds({ viewW: 1056, viewH: 1056 }); // zoom 1 → 两侧都有余量
    store.fit(b);
    store.dragTo(b, 0, 0, -200, 0);
    const atRelease = store.pose().panX;
    store.coast(-1.2, 0);
    const first = store.step(b);
    expect(first.pose.panX).toBeLessThan(atRelease); // 仍在往前滑
    expect(first.settled).toBe(false);
    const { frames } = runToSettle(store, b);
    expect(frames).toBeGreaterThan(2);
  });

  it('速度为 0 时立即收敛（轻拖一下松手不该自己滑）', () => {
    const store = createPoseStore();
    store.fit(bounds());
    store.coast(0, 0);
    expect(store.step(bounds()).settled).toBe(true);
  });
});

describe('freeze（新手势掐掉上一段动画）', () => {
  it('把 target 拉到 current 并清速度：按住时图不会还在自己走', () => {
    const store = createPoseStore();
    store.fit(bounds());
    store.zoomTo(bounds(), 2, 0, 0);
    store.step(bounds()); // 动画进行到一半
    const frozen = store.freeze();
    expect(store.aim()).toEqual(frozen);
    const next = store.step(bounds());
    expect(next.settled).toBe(true);
    expect(next.pose).toEqual(frozen);
  });

  it('freeze 之后拖动从冻结位姿继续（不会跳回动画终点）', () => {
    const store = createPoseStore();
    store.fit(bounds());
    store.zoomTo(bounds(), 2, 0, 0);
    store.step(bounds());
    const frozen = store.freeze();
    store.dragTo(bounds(), frozen.panX, frozen.panY, 10, 0);
    expect(store.pose().zoom).toBeCloseTo(frozen.zoom);
    expect(store.pose().panX).toBeCloseTo(frozen.panX + 10);
  });
});

describe('极端输入不产出 NaN', () => {
  it('反复用 NaN 位姿操作后仍然有限', () => {
    const store = createPoseStore();
    store.fit(bounds());
    store.dragTo(bounds(), Number.NaN, Number.NaN, Number.NaN, Number.NaN);
    store.zoomTo(bounds(), Number.NaN, Number.NaN, Number.NaN);
    store.panBy(bounds(), Number.NaN, Number.NaN);
    store.coast(Number.NaN, Number.NaN);
    const pose = runToSettle(store, bounds()).pose;
    expect(Number.isFinite(pose.zoom)).toBe(true);
    expect(Number.isFinite(pose.panX)).toBe(true);
    expect(Number.isFinite(pose.panY)).toBe(true);
  });

  it('零尺寸容器（还没测量出来）也不炸', () => {
    const store = createPoseStore();
    store.fit(bounds({ viewW: 0, viewH: 0, minZoom: 0 }));
    store.zoomTo(bounds({ viewW: 0, viewH: 0, minZoom: 0 }), 2, 0, 0);
    expect(Number.isFinite(store.pose().zoom)).toBe(true);
  });
});
