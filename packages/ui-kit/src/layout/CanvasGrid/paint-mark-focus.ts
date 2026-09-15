/**
 * `paintMarkFocus` —— 点的**聚焦圈**（悬停 / 选中的视觉反馈）。
 *
 * 为什么用"圈"而不是"把点变大"或"换个颜色"：
 * - 变大会让**位置**看起来变了（点直径 = 1 格是硬口径，不能为了反馈破坏它）；
 * - 换颜色会和"金色 = 功能点"这条颜色语义打架（本项目四种颜色各有分工）。
 * 在点外面套一圈则同时满足：不改变点的几何、不动颜色语义、且一眼能看出是哪一圈。
 *
 * 悬停用细圈（瞬时）、选中用粗圈（常驻）；两者可同时出现（选中的点被悬停时是双圈）。
 */
import type { GridPaintContext2D } from './paint-grid.js';

export interface MarkFocusInput {
  /** 圆心（画布 CSS 像素） */
  x: number;
  y: number;
  /** **点**的半径（CSS 像素）；聚焦圈画在它外面 */
  dotRadius: number;
  color: string;
  /** 线宽，默认 1.5 */
  widthPx?: number;
  /** 与点之间的间隙（CSS 像素），默认 3 */
  gapPx?: number;
}

/** 整圈（`arc` 的起止角）。 */
const FULL_TURN = Math.PI * 2;

export function paintMarkFocus(ctx: GridPaintContext2D, input: MarkFocusInput): void {
  const { x, y, dotRadius, color, widthPx = 1.5, gapPx = 3 } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(dotRadius)) return;
  // 圈画在点外面；间隙非负（负数会让圈压住点，看着像点变大了）
  const radius = dotRadius + Math.max(0, gapPx) + widthPx / 2;
  if (radius <= 0) return;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  // 虚线是上下文状态，会跨层残留 —— 聚焦圈必须是实线（与连接线同一教训）
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, FULL_TURN);
  ctx.stroke();
  ctx.restore();
}
