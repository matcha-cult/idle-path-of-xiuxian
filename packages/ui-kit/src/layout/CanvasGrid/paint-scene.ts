/**
 * `paintScene` —— **一帧的全部绘制**，层序从下到上：
 *
 * ```
 * 底色 → 细格线 → 主线 → 轴标 → 悬停格（交互反馈） → 轨道环 → 连接线 → 功能点 → 聚焦圈 → 光标标签
 * ```
 *
 * ## 两套坐标（与 `pose.ts` 同一口径，别混）
 * - **内容空间**：环 / 连接线 / 功能点 / 悬停格按内容坐标绘制，`ctx` 上叠了位姿变换
 *   （`scale` + `offset`）—— 于是缩放平移**不用改任何 painter**；
 * - **屏幕空间**：**网格与轴标**（线宽/字号是渲染属性，不跟着放大：线宽恒定 1px、逐条对齐
 *   设备像素，见 `paint-grid`）、底色（要铺满**视口**，否则缩小时外面会留上一帧残影）与
 *   **光标标签**（文字必须与缩放无关、永远那么大）。
 *
 * ## 线宽：一律"屏幕像素"口径
 * 内容空间画的那几层的线宽都按 `1 / scale` 传下去（`px`），所以**任何缩放下屏幕线宽恒定**：
 * 环/连线 1.5px、悬停格 2px、聚焦圈 1.5/2px。粗细只表达"看不看得见"，不表达"地图上的距离"
 * —— 距离语义留给**几何**（环半径、点半径、线的两端），它们照旧随缩放。
 *
 * ## 为什么层序收在一个函数里
 * 「谁压在谁上面」是肉眼最先看出、也最容易被重构打乱的性质：收在纯函数里就能用假上下文
 * 直接断言**调用次序**（而且现在按**颜色**断言，比按调用序号猜可靠得多）。
 * 内容内部顺序：环 → 线 → 点 → 聚焦圈（骨架在下、节点在上、反馈在最上）。
 *
 * 它同时负责**位图尺寸**：`canvas.width/height = 视口 CSS 尺寸 × dpr`，且**只在变化时写**
 *（写这两个属性会清空画布并重置上下文状态）。
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
import type { Pose } from './pose.js';
import type { GridLink, GridMark, GridPoint, GridRing } from './types.js';
import { worldToScreen } from './world.js';

/** 轴标字号（CSS 像素）。 */
const FONT_PX = 10;
/** 线宽（**屏幕** CSS 像素）：环/连线 1.5、聚焦圈悬停 1.5 / 选中 2、悬停格 2。 */
const RING_WIDTH_PX = 1.5;
const LINK_WIDTH_PX = 1.5;
const FOCUS_HOVER_WIDTH_PX = 1.5;
const FOCUS_SELECTED_WIDTH_PX = 2;
const FOCUS_GAP_PX = 3;

/** 只需要能读写位图尺寸，因此测试给个普通对象即可（jsdom 的 canvas 也能满足）。 */
export interface SceneCanvas {
  width: number;
  height: number;
}

export interface SceneInput {
  layout: GridLayout;
  /** 视口（画布 CSS 尺寸）；底色与光标标签都按它算 */
  viewW: number;
  viewH: number;
  dpr: number;
  /** 视图位姿：内容坐标 → 屏幕坐标 */
  pose: Pose;
  /** 受控高亮格 */
  hover: GridCell | null;
  /** 光标位置（**屏幕空间** CSS 像素）；null = 不画坐标标签 */
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
    viewW,
    viewH,
    dpr,
    pose,
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

  const bitmapW = Math.round(viewW * dpr);
  const bitmapH = Math.round(viewH * dpr);
  if (canvas.width !== bitmapW) canvas.width = bitmapW;
  if (canvas.height !== bitmapH) canvas.height = bitmapH;

  // 屏幕空间：底色要铺满**视口**（缩小时内容比视口小，没铺到的地方会留上一帧残影）
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.restore();

  // 网格与轴标也在**屏幕空间**画：线宽恒定 1px、字号恒定、逐条对齐设备像素（见 `paint-grid`）
  const drew = paintGrid(ctx, { layout, pose, viewW, viewH, dpr, palette, majorStep, fontPx: FONT_PX, fontFamily });
  if (!drew) return false; // 底色已铺满，其余内容一概不画

  // 内容空间：位姿变换一次搞定缩放 + 平移，之后的 painter 全都不认识位姿
  ctx.setTransform(dpr * pose.scale, 0, 0, dpr * pose.scale, dpr * pose.offsetX, dpr * pose.offsetY);

  /** 内容空间里的"1 屏幕像素"：线宽乘它 ⇒ 屏幕线宽与缩放无关 */
  const px = pose.scale > 0 ? 1 / pose.scale : 1;

  // 交互反馈层：悬停格（压在底图之上、内容之下）
  if (hover !== null) {
    paintHoverCell(ctx, { cell: hover, layout, color: palette.accent, widthPx: 2 * px });
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
        widthPx: (ring.widthPx ?? RING_WIDTH_PX) * px,
        dashScale: px,
        ...(ring.dashed === undefined ? {} : { dashed: ring.dashed }),
      });
    }
    for (const link of links) {
      const from = worldToScreen(link.from, center, layout.cellPx);
      const to = worldToScreen(link.to, center, layout.cellPx);
      paintLink(ctx, { x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: palette.link, widthPx: LINK_WIDTH_PX * px });
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

    // 聚焦圈画在**所有点之后**：圈套在点外面，不该被相邻的点盖住。
    // 先悬停（细）后选中（粗）：两者同时存在时看到的是双圈，语义清楚。
    const focusOn = (key: string | null, widthPx: number): void => {
      // 间隙同样按 `1 / scale`：圈与点的距离在屏幕上恒定，不随放大而被拉远
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
        gapPx: FOCUS_GAP_PX * px,
      });
    };
    focusOn(hoverMarkKey, FOCUS_HOVER_WIDTH_PX * px);
    focusOn(selectedMarkKey, FOCUS_SELECTED_WIDTH_PX * px);
  }

  // 屏幕空间：光标标签。文字**不随缩放变大**（它是读数，不是地图内容），也不受位姿平移影响
  // —— 所以这里显式把变换重置回屏幕空间。
  const hoveredMark = hoverMarkKey === null
    ? undefined
    : marks[marks.findIndex((mark, position) => markKeyOf(mark, position) === hoverMarkKey)];
  const labelText = hoveredMark?.label ?? (hover === null ? null : cellLabel(hover));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (showCursorLabel && labelText !== null && cursor !== null) {
    paintCursorLabel(ctx, {
      text: labelText,
      x: cursor.x,
      y: cursor.y,
      width: viewW,
      height: viewH,
      fontPx: FONT_PX,
      fontFamily,
      background: cursorLabelBackground,
      foreground: cursorLabelForeground,
    });
  }

  return true;
}
