/**
 * `paintGuideRing` —— 参考圆 / **轨道**（功能点所在的环）。
 *
 * 它是"结构"，不是"反馈"：颜色用 `palette.guide`（`colorSuccess`），与网格线（border 系）、
 * 悬停高亮（primary）、功能点（warning）四者互不混淆 —— 越往后叠层越要守住这一点，
 * 否则用户看到的是一团分不清谁是谁的线。
 *
 * 半径以**格**为单位由调用方乘好（`radiusCells × cellPx`），本层不懂坐标系：
 * 于是「8 等分环 r=9」这类口径只存在于数据与几何里，改一处即可。
 */
import type { GridPaintContext2D } from './paint-grid.js';

export interface GuideRingInput {
  /** 圆心（画布 CSS 像素） */
  cx: number;
  cy: number;
  /** 半径（画布 CSS 像素） */
  radius: number;
  color: string;
  /** 线宽，默认 1.5 */
  widthPx?: number;
  /** 虚线（默认实线） */
  dashed?: boolean;
}

/** 整圈（`arc` 的起止角）。 */
const FULL_TURN = Math.PI * 2;
/** 虚线节奏：4 实 4 空（CSS 像素）。 */
const DASH: number[] = [4, 4];

export function paintGuideRing(ctx: GridPaintContext2D, input: GuideRingInput): void {
  const { cx, cy, radius, color, widthPx = 1.5, dashed = false } = input;
  // 半径 ≤ 0 / 非数 ⇒ 不画（"半径 0 的环"= 中心点本身，不该画成一坨）
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= 0) return;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  ctx.setLineDash(dashed ? DASH : []);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, FULL_TURN);
  ctx.stroke();
  ctx.restore();
}
