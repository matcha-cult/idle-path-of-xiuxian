/**
 * `paintCenterCircle` —— 在坐标系中心画一个圆**内容标记**（画在网格线之上）。
 *
 * 它是"内容层"的第一个元素：只依赖调用方算好的圆心与半径，自己不懂坐标系 ——
 * 这样「直径 = 1 格」这类口径全部留在几何层（`centerMarkRadius`），改口径只改一处。
 *
 * 为什么是**实心**：直径只有 1 格（实测常见 10~16px），描边圆在这个尺度下几乎看不见；
 * 实心点在亮暗两套 token 下都清楚。要空心圈只需把 `fill` 换成 `stroke`（一行）。
 */
import type { GridPaintContext2D } from './paint-grid.js';

export interface CenterCircleInput {
  /** 圆心（画布 CSS 像素） */
  cx: number;
  cy: number;
  /** 半径（画布 CSS 像素） */
  radius: number;
  color: string;
}

/** 整个圆周（`arc` 的起止角）。 */
const FULL_TURN = Math.PI * 2;

export function paintCenterCircle(ctx: GridPaintContext2D, input: CenterCircleInput): void {
  const { cx, cy, radius, color } = input;
  // 半径 ≤ 0 / 非数 ⇒ 什么都不画（尺寸未知时不留下一个"半个像素的脏点"）
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= 0) return;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, FULL_TURN);
  ctx.fill();
  ctx.restore();
}
