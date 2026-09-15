/**
 * `paintLink` —— 两点之间的**连接线**（图的边）。
 *
 * 端点收的是**画布 CSS 像素**（调用方从世界坐标换算好），本层不懂坐标系：
 * 于是「谁连谁」这件事完全留在数据与拓扑层（web 侧 `map-links.ts`）。
 *
 * 为什么显式 `setLineDash([])`：虚线是上下文状态，会跨层残留 —— 虽然 `paintGuideRing`
 * 有 `save/restore` 兜住，但**这条线不该依赖别人的好习惯**（少一个隐患就少一次
 * "为什么连接线是虚线"的排查）。
 */
import type { GridPaintContext2D } from './paint-grid.js';

export interface LinkPaintInput {
  /** 起点（画布 CSS 像素） */
  x1: number;
  y1: number;
  /** 终点（画布 CSS 像素） */
  x2: number;
  y2: number;
  color: string;
  /** 线宽，默认 1.5 */
  widthPx?: number;
}

export function paintLink(ctx: GridPaintContext2D, input: LinkPaintInput): void {
  const { x1, y1, x2, y2, color, widthPx = 1.5 } = input;
  // 非数 ⇒ 不画（NaN 会让整条 path 静默失效，等于故障无声）
  if (![x1, y1, x2, y2].every((value) => Number.isFinite(value))) return;
  // 两端重合 ⇒ 不画：那是一个点，由功能点那一层负责，不该在这里留下一个"脏点"
  if (x1 === x2 && y1 === y2) return;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
