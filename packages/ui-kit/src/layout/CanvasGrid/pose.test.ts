/**
 * `pose` 单测 —— 这一层是"缩放拖拽手感"的全部数学，而且**上一轮"一拖就瞬移到左边"的根因就在这里**，
 * 所以每个 case 都要钉死，尤其是那条当年漏掉的：**内容比视口小时必须居中、不能给拖走**。
 *
 * 坐标口径（看 `pose.ts` 的头注释）：内容坐标 --pose--> 屏幕坐标。
 */
import { describe, expect, it } from 'vitest';
import {
  FIT_POSE,
  MAX_SCALE,
  MIN_SCALE,
  clampPose,
  clampScale,
  contentScreenRect,
  isFitPose,
  panBy,
  toContent,
  toScreen,
  zoomAt,
} from './pose.js';
import type { Pose, Size } from './pose.js';

/** 视口 400×300；内容"刚好适配"时 = 400×300（`cellPx` 按容器取整，所以 scale=1 就是适配）。 */
const VIEW: Size = { w: 400, h: 300 };
const FIT_CONTENT: Size = { w: 400, h: 300 };

describe('clampScale', () => {
  it('范围内原样；越界夹到上下限；非数一律回到 1（不要 NaN / Infinity）', () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(999)).toBe(MAX_SCALE);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe('clampPose', () => {
  it('⭐ 适配位姿（scale=1、内容 = 视口）保持 (0,0) —— 就是今天这张刚好铺满的网格', () => {
    expect(clampPose(FIT_POSE, FIT_CONTENT, VIEW)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('内容某一轴比视口短 ⇒ 那一轴**居中**（另一轴各自算）', () => {
    // 内容 200×100、视口 400×300、scale=1 ⇒ x 居中 (400-200)/2 = 100；y 居中 (300-100)/2 = 100
    expect(clampPose({ scale: 1, offsetX: 0, offsetY: 0 }, { w: 200, h: 100 }, VIEW)).toEqual({
      scale: 1,
      offsetX: 100,
      offsetY: 100,
    });
  });

  it('内容比视口大 ⇒ 边缘不进视口内（偏移被夹在 [视口-内容, 0]）', () => {
    const content: Size = { w: 300, h: 300 };
    const scaled: Pose = { scale: 2, offsetX: 0, offsetY: 0 }; // 内容屏幕尺寸 600×600
    expect(clampPose({ ...scaled, offsetX: 999 }, content, VIEW).offsetX).toBe(0);
    expect(clampPose({ ...scaled, offsetX: -999 }, content, VIEW).offsetX).toBe(VIEW.w - 600);
    expect(clampPose({ ...scaled, offsetX: -150 }, content, VIEW).offsetX).toBe(-150);
    expect(clampPose({ ...scaled, offsetY: -150 }, content, VIEW).offsetY).toBe(-150);
  });

  it('缩放越界时先夹缩放再算偏移', () => {
    const content: Size = { w: 400, h: 300 };
    const pose = clampPose({ scale: 99, offsetX: 0, offsetY: 0 }, content, VIEW);
    expect(pose.scale).toBe(MAX_SCALE);
    // 偏移落在合法区间内（输入 0 本身合法 ⇒ 保持 0；越界输入才会被推回区间端点）
    expect(pose.offsetX).toBe(0);
    expect(clampPose({ scale: 99, offsetX: -99999, offsetY: -99999 }, content, VIEW)).toEqual({
      scale: MAX_SCALE,
      offsetX: VIEW.w - content.w * MAX_SCALE,
      offsetY: VIEW.h - content.h * MAX_SCALE,
    });
  });

  it('内容尺寸非法 ⇒ 只夹缩放、偏移归 0（不猜）', () => {
    expect(clampPose({ scale: 3, offsetX: 5, offsetY: 5 }, { w: 0, h: 0 }, VIEW)).toEqual({
      scale: 3,
      offsetX: 0,
      offsetY: 0,
    });
    expect(clampPose({ scale: Number.NaN, offsetX: Number.NaN, offsetY: Number.NaN }, { w: Number.NaN, h: 1 }, VIEW)).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });
});

describe('⭐ 当年那条"一拖就瞬移"的 case（内容比视口小时不许拖走）', () => {
  it('留白轴拖动后仍居中 —— 而不是被公式甩到边上', () => {
    const content: Size = { w: 200, h: 300 }; // x 轴留白、y 轴刚好
    const before = clampPose(FIT_POSE, content, VIEW); // offsetX = (400-200)/2 = 100
    expect(before.offsetX).toBe(100);

    // 往左狠拖、往右狠拖：留白轴都必须纹丝不动
    expect(panBy(before, -500, 0, content, VIEW).offsetX).toBe(100);
    expect(panBy(before, +500, 0, content, VIEW).offsetX).toBe(100);
    // 刚好铺满的那一轴：内容不比视口大，同样不给拖（整图始终完整可见）
    expect(panBy(before, 0, -500, content, VIEW).offsetY).toBe(0);
  });

  it('内容整体比视口小 ⇒ 两轴都居中，怎么拖都不动（不可能"瞬移"）', () => {
    const content: Size = { w: 100, h: 50 };
    const centered = clampPose(FIT_POSE, content, VIEW);
    expect(centered).toEqual({ scale: 1, offsetX: 150, offsetY: 125 });
    expect(panBy(centered, -9999, 9999, content, VIEW)).toEqual(centered);
  });

  it('放大到比视口大之后才能拖，而且拖不出边界', () => {
    const content: Size = { w: 200, h: 200 };
    const zoomed = clampPose({ scale: 2, offsetX: 0, offsetY: 0 }, content, VIEW); // 400×400
    expect(zoomed.offsetX).toBe(0); // 与视口等宽 ⇒ 靠左，右边缘齐平
    expect(panBy(zoomed, 500, 500, content, VIEW)).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
    expect(panBy(zoomed, -500, -500, content, VIEW)).toEqual({
      scale: 2,
      offsetX: VIEW.w - 400,
      offsetY: VIEW.h - 400,
    });
  });
});

describe('zoomAt（以光标为定点缩放）', () => {
  const content: Size = { w: 200, h: 200 };

  it('⭐ 锚点底下的内容点缩放前后不动（手感对不对就看这一条）', () => {
    const pose = clampPose({ scale: 2, offsetX: -100, offsetY: -50 }, content, VIEW);
    const anchor = { x: 250, y: 120 };
    const before = toContent(anchor.x, anchor.y, pose);
    const after = zoomAt(pose, 1.6, anchor, content, VIEW);
    const afterContent = toContent(anchor.x, anchor.y, after);
    expect(afterContent.x).toBeCloseTo(before.x, 9);
    expect(afterContent.y).toBeCloseTo(before.y, 9);
  });

  it('缩放倍数非法（0 / 负数 / 非数）⇒ 原样返回（夹紧后）', () => {
    const pose = clampPose({ scale: 2, offsetX: 0, offsetY: 0 }, content, VIEW);
    for (const factor of [0, -1, Number.NaN]) {
      expect(zoomAt(pose, factor, { x: 10, y: 10 }, content, VIEW)).toEqual(pose);
    }
  });

  it('放大到上限就不再放大（滚轮狂滚也不会失控）', () => {
    let pose: Pose = clampPose(FIT_POSE, content, VIEW);
    for (let i = 0; i < 200; i += 1) pose = zoomAt(pose, 1.2, { x: 200, y: 150 }, content, VIEW);
    expect(pose.scale).toBe(MAX_SCALE);
  });

  it('缩小到下限就不再缩小', () => {
    let pose: Pose = clampPose(FIT_POSE, content, VIEW);
    for (let i = 0; i < 200; i += 1) pose = zoomAt(pose, 0.8, { x: 200, y: 150 }, content, VIEW);
    expect(pose.scale).toBe(MIN_SCALE);
  });

  it('缩放结果一定满足夹紧（不会因为定点公式把内容甩出去）', () => {
    const pose = clampPose({ scale: 4, offsetX: -300, offsetY: -300 }, content, VIEW);
    const zoomed = zoomAt(pose, 0.5, { x: 0, y: 0 }, content, VIEW);
    expect(zoomed).toEqual(clampPose(zoomed, content, VIEW));
    // 缩到比视口小 ⇒ 居中
    expect(zoomed.offsetX).toBe((VIEW.w - content.w * zoomed.scale) / 2);
  });
});

describe('坐标换算与读数', () => {
  const pose: Pose = { scale: 0.5, offsetX: 120, offsetY: 40 };

  it('toScreen / toContent 互为逆', () => {
    const point = toScreen(37, 91, pose);
    expect(point).toEqual({ x: 37 * 0.5 + 120, y: 91 * 0.5 + 40 });
    const back = toContent(point.x, point.y, pose);
    expect(back.x).toBeCloseTo(37, 9);
    expect(back.y).toBeCloseTo(91, 9);
  });

  it('scale 非法时 toContent 不抛错（返回 0,0）', () => {
    expect(toContent(10, 10, { scale: 0, offsetX: 0, offsetY: 0 })).toEqual({ x: 0, y: 0 });
    expect(toContent(10, 10, { scale: Number.NaN, offsetX: 0, offsetY: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('contentScreenRect 就是"内容在屏幕上的位置"（排查夹紧对不对看它）', () => {
    expect(contentScreenRect({ scale: 2, offsetX: -30, offsetY: -10 }, { w: 200, h: 100 })).toEqual({
      x: -30,
      y: -10,
      w: 400,
      h: 200,
    });
  });

  it('isFitPose：只看缩放（scale=1 时内容必然整个装得下、偏移没有自由度）', () => {
    expect(isFitPose(FIT_POSE)).toBe(true);
    expect(isFitPose({ scale: 1, offsetX: 123, offsetY: 45 })).toBe(true);
    expect(isFitPose({ scale: 1.5, offsetX: 0, offsetY: 0 })).toBe(false);
  });
});
