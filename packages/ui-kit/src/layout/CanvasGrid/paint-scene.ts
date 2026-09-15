/**
 * `paintScene` —— **一帧的全部绘制**，层序从下到上：
 *
 * ```
 * 底色 → 细格线 → 主线 → 轴标 → 悬停格（交互反馈） → 轨道环 → 功能点 → 光标坐标标签
 * ```
 *
 * 为什么把层序收在一个函数里：「谁压在谁上面」是肉眼最先看出、也最容易被重构打乱的性质。
 * 收在纯函数里就能用假上下文直接断言**调用次序**（网格的 `stroke` 必须早于功能点的 `arc`），
 * 而不是等人在浏览器里发现「圆被网格线盖住了」。
 *
 * 为什么**内容（轨道 / 功能点）压在交互反馈之上**：悬停高亮是"鼠标现在在哪"的瞬时提示，
 * 而轨道与功能点是地图内容；内容不该被鼠标经过时染上一层色。光标坐标标签再压在最上面。
 *
 * 它同时负责**位图尺寸**：`canvas.width/height = CSS 尺寸 × dpr`，且**只在变化时写**——
 * 写这两个属性会清空画布并重置上下文状态（每帧无脑写会白白丢掉状态、也没有必要）。
 *
 * 返回是否画出了网格：几何不可用时（尺寸未量出 / 空间不足）只铺底色，其余一概不画。
 */
import { cellLabel, gridCenter } from './geometry.js';
import type { GridCell, GridLayout } from './geometry.js';
import type { GridPalette } from './palette.js';
import { paintCursorLabel } from './paint-cursor-label.js';
import { paintGrid } from './paint-grid.js';
import type { GridPaintContext2D } from './paint-grid.js';
import { paintGuideRing } from './paint-guide-ring.js';
import { paintHoverCell } from './paint-hover-cell.js';
import { paintMarkDot } from './paint-mark-dot.js';
import type { GridMark, GridPoint, GridRing } from './types.js';
import { worldToScreen } from './world.js';

/** 轴标字号（CSS 像素）。 */
const FONT_PX = 10;

/** 只需要能读写位图尺寸，因此测试给个普通对象即可（jsdom 的 canvas 也能满足）。 */
export interface SceneCanvas {
  width: number;
  height: number;
}

export interface SceneInput {
  layout: GridLayout;
  /** 画布 CSS 尺寸 */
  boxW: number;
  boxH: number;
  dpr: number;
  /** 受控高亮格 */
  hover: GridCell | null;
  /** 光标位置（画布内 CSS 像素）；null = 不画坐标标签 */
  cursor: GridPoint | null;
  majorStep: number;
  showCursorLabel: boolean;
  fontFamily: string;
  /** 光标标签底色 / 字色（调用方给反色，亮暗主题自动都对） */
  cursorLabelBackground: string;
  cursorLabelForeground: string;
  /** 参考圆 / 轨道（半径以「格」为单位） */
  rings: readonly GridRing[];
  /** 功能点（世界坐标 + 半径，均以「格」为单位） */
  marks: readonly GridMark[];
  palette: GridPalette;
}

export function paintScene(
  canvas: SceneCanvas,
  ctx: GridPaintContext2D,
  input: SceneInput,
): boolean {
  const {
    layout,
    boxW,
    boxH,
    dpr,
    hover,
    cursor,
    majorStep,
    showCursorLabel,
    fontFamily,
    cursorLabelBackground,
    cursorLabelForeground,
    rings,
    marks,
    palette,
  } = input;

  const bitmapW = Math.round(boxW * dpr);
  const bitmapH = Math.round(boxH * dpr);
  if (canvas.width !== bitmapW) canvas.width = bitmapW;
  if (canvas.height !== bitmapH) canvas.height = bitmapH;

  // 位图放大了 dpr 倍 → 之后一律用 CSS 像素坐标绘制
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const drew = paintGrid(ctx, { layout, palette, majorStep, fontPx: FONT_PX, fontFamily });
  if (!drew) return false;

  // 交互反馈层：悬停格（压在底图之上、内容之下）
  if (hover !== null) {
    paintHoverCell(ctx, { cell: hover, layout, color: palette.accent });
  }

  // 内容层：轨道环 → 功能点（都压在悬停高亮之上，避免被鼠标反馈染色；点再压在环之上）
  const center = gridCenter(layout);
  if (center !== null) {
    for (const ring of rings) {
      paintGuideRing(ctx, {
        cx: center.x,
        cy: center.y,
        radius: ring.radiusCells * layout.cellPx,
        color: palette.guide,
        ...(ring.widthPx === undefined ? {} : { widthPx: ring.widthPx }),
        ...(ring.dashed === undefined ? {} : { dashed: ring.dashed }),
      });
    }
    for (const mark of marks) {
      const at = worldToScreen(mark.at, center, layout.cellPx);
      paintMarkDot(ctx, {
        x: at.x,
        y: at.y,
        radius: mark.radiusCells * layout.cellPx,
        color: palette.mark,
      });
    }
  }

  if (showCursorLabel && hover !== null && cursor !== null) {
    paintCursorLabel(ctx, {
      text: cellLabel(hover),
      x: cursor.x,
      y: cursor.y,
      width: boxW,
      height: boxH,
      fontPx: FONT_PX,
      fontFamily,
      background: cursorLabelBackground,
      foreground: cursorLabelForeground,
    });
  }

  return true;
}
