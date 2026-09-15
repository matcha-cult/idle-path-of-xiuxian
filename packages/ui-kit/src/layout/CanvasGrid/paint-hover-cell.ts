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
}

export function paintHoverCell(ctx: GridPaintContext2D, input: HoverCellInput): void {
  const { cell, layout, color, alpha = 0.16 } = input;
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
  ctx.lineWidth = 2;
  // 内缩 1px：2px 描边压在格线上会盖住线，内缩后"格子还是那个格子"
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.restore();
}
