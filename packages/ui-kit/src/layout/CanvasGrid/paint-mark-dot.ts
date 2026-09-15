/**
 * `paintMarkDot` —— **功能点**（主峰 / 功能峰 / 以后的四院四门）：一个实心圆点。
 *
 * 为什么是实心：口径是「直径 = 1 格」（实测常见 10~16px），描边圆在这个尺度下几乎看不见；
 * 实心点在亮暗两套 token 下都清楚。
 *
 * 为什么叫 `mark` 而不是 `center`：现在有 9 个点共用它（1 主峰 + 8 功能峰），
 * 而「直径 = 1 格」这条口径已经搬到数据里（`radiusCells: 0.5`）——
 * 组件只负责"在给定的世界位置画一个半径多少格的点"，不认识谁是中心。
 */
import type { GridPaintContext2D } from './paint-grid.js';

export interface MarkDotInput {
  /** 圆心（画布 CSS 像素） */
  x: number;
  y: number;
  /** 半径（画布 CSS 像素） */
  radius: number;
  color: string;
}

/** 整圈（`arc` 的起止角）。 */
const FULL_TURN = Math.PI * 2;

export function paintMarkDot(ctx: GridPaintContext2D, input: MarkDotInput): void {
  const { x, y, radius, color } = input;
  // 半径 ≤ 0 / 非数 ⇒ 什么都不画（尺寸未知时不留下"半个像素的脏点"）
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) return;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, FULL_TURN);
  ctx.fill();
  ctx.restore();
}
