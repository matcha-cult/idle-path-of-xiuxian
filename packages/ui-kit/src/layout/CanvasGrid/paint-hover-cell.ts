/**
 * `paintHoverCell` —— 悬停格的**交互反馈**（淡填充 + 内缩描边）。
 *
 * 为什么单独一层而不是塞进 `paintGrid`：层序是这一轮的主题（网格 → 悬停 → 内容 → 标签），
 * 「谁压在谁上面」必须在 `paintScene` 里一眼看全。藏在 `paintGrid` 内部就会变成
 * 「文档写 A 压 B、代码实际 B 压 A」——本轮真的这么错过一次，靠层序单测才发现。
 *
 * 为什么填充 + 描边都要：浅色主题下 0.16 的淡填充很弱（负责"是哪一格"），
 * 描边负责"边界在哪"（负责对格子用的场景）。
 */
import { cellRect } from './geometry.js';
import type { GridCell, GridLayout } from './geometry.js';
import type { GridPaintContext2D } from './paint-grid.js';

export interface HoverCellInput {
  cell: GridCell;
  layout: GridLayout;
  color: string;
  /** 填充不透明度（默认 0.16） */
  alpha?: number;
  /**
   * 描边线宽（**内容空间**单位，默认 2）。调用方按 `1 / scale` 传进来，
   * 于是**屏幕线宽恒定** —— 线宽恒定策略统一由 `paintScene` 决定，本层不管位姿。
   */
  widthPx?: number;
}

export function paintHoverCell(ctx: GridPaintContext2D, input: HoverCellInput): void {
  const { cell, layout, color, alpha = 0.16, widthPx = 2 } = input;
  const rect = cellRect(cell, layout);
  // 越界格（脏 props）⇒ 忽略，而不是抛错 / 画到网格外
  if (rect === null) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  // 描边前把不透明度还原，否则边界会跟着填充一起变淡
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  // 内缩半个线宽：描边压在格线上会盖住线，内缩后"格子还是那个格子"
  const inset = widthPx / 2;
  ctx.strokeRect(rect.x + inset, rect.y + inset, rect.w - widthPx, rect.h - widthPx);
  ctx.restore();
}
