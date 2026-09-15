/**
 * `paintScene` —— **一帧的全部绘制**，层序从下到上：
 *
 * ```
 * 底色 → 细格线 → 主线 → 轴标 → 悬停格（交互反馈） → 轨道环 → 连接线 → 功能点 → 光标坐标标签
 * ```
 *
 * 为什么把层序收在一个函数里：「谁压在谁上面」是肉眼最先看出、也最容易被重构打乱的性质。
 * 收在纯函数里就能用假上下文直接断言**调用次序**（网格的 `stroke` 必须早于功能点的 `arc`），
 * 而不是等人在浏览器里发现「圆被网格线盖住了」。
 *
 * 为什么**内容（轨道 / 连接线 / 功能点）压在交互反馈之上**：悬停高亮是"鼠标现在在哪"的瞬时提示，
 * 而轨道、边、点都是地图内容；内容不该被鼠标经过时染上一层色。光标坐标标签再压在最上面。
 * 内容层内部：**环 → 线 → 点**（骨架在下、节点在上，点永远盖住线头）。
 *
 * 它同时负责**位图尺寸**：`canvas.width/height = CSS 尺寸 × dpr`，且**只在变化时写**——
 * 写这两个属性会清空画布并重置上下文状态（每帧无脑写会白白丢掉状态、也没有必要）。
 *
 * 返回是否画出了网格：几何不可用时（尺寸未量出 / 空间不足）只铺底色，其余一概不画。
 */
import { cellLabel, gridCenter } from './geometry.js';
import type { GridCell, GridLayout } from './geometry.js';
import { markKeyOf } from './hit-test.js';
import type { GridPalette } from './palette.js';
import { paintCursorLabel } from './paint-cursor-label.js';
import { paintGrid } from './paint-grid.js';
import type { GridPaintContext2D } from './paint-grid.js';
import { paintGuideRing } from './paint-guide-ring.js';
import { paintHoverCell } from './paint-hover-cell.js';
import { paintLink } from './paint-link.js';
import { paintMarkDot } from './paint-mark-dot.js';
import { paintMarkFocus } from './paint-mark-focus.js';
import type { GridLink, GridMark, GridPoint, GridRing } from './types.js';
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
  /** 连接线（两端都是世界坐标） */
  links: readonly GridLink[];
  /** 悬停 / 选中的点 key（`null` = 没有）；聚焦圈画在所有点之后 */
  hoverMarkKey: string | null;
  selectedMarkKey: string | null;
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
    links,
    hoverMarkKey,
    selectedMarkKey,
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

  // 内容层：轨道环 → 连接线 → 功能点（都压在悬停高亮之上，避免被鼠标反馈染色）
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
    for (const link of links) {
      const from = worldToScreen(link.from, center, layout.cellPx);
      const to = worldToScreen(link.to, center, layout.cellPx);
      paintLink(ctx, { x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: palette.link });
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

    // 聚焦圈画在**所有点之后**：圈是"套在点外面"的，不该被相邻的点盖住。
    // 先悬停（细）后选中（粗）：两者同时存在时看到的是双圈，语义清楚。
    const focusOn = (key: string | null, widthPx: number): void => {
      if (key === null) return;
      const index = marks.findIndex((mark, position) => markKeyOf(mark, position) === key);
      const mark = marks[index];
      if (mark === undefined) return;
      const at = worldToScreen(mark.at, center, layout.cellPx);
      paintMarkFocus(ctx, {
        x: at.x,
        y: at.y,
        dotRadius: mark.radiusCells * layout.cellPx,
        color: palette.accent,
        widthPx,
      });
    };
    focusOn(hoverMarkKey, 1.5);
    focusOn(selectedMarkKey, 2);
  }

  // 光标标签：悬停到点了就报**名字**（想知道"这是哪儿"），否则报格坐标
  const hoveredMark = hoverMarkKey === null
    ? undefined
    : marks[marks.findIndex((mark, position) => markKeyOf(mark, position) === hoverMarkKey)];
  const labelText = hoveredMark?.label ?? (hover === null ? null : cellLabel(hover));
  if (showCursorLabel && labelText !== null && cursor !== null) {
    paintCursorLabel(ctx, {
      text: labelText,
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
