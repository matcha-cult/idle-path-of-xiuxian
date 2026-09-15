/**
 * `paintGrid` —— 网格线与轴标。**在屏幕空间画**：线宽恒定 1px、字号恒定、逐条对齐设备像素。
 *
 * ## 为什么网格不跟内容一起缩放（而环/点/连线跟）
 * 线宽与字号是**渲染属性**，不是"地图上的距离"：它们表达的是"看不看得见"。
 * 整张图放大 8 倍时，线不该变成 8px 粗、轴标不该变成 80px 大 —— 那正是"放大后线条特别粗"。
 * 位置仍然是内容语义（`offsetX + 内容坐标 × scale`），只有**粗细与对齐**落在屏幕空间。
 *
 * ## 为什么必须搬出内容空间
 * 旧的清晰化是内容空间的 `crisp()`（整数 + 0.5），它只在 `scale = 1` 且 dpr=1 时成立：
 * 叠上 `scale = 1.7` / dpr=2 之后线的落点不再对齐设备像素，看着又粗又虚。
 * 对齐的判据与实现都在 `snap.ts`（一处），本文件只负责"算屏幕坐标 + 逐条对齐"。
 *
 * ## 三层自适应（缩得越小，画得越少）
 * - 细线：屏幕间距 < `MIN_MINOR_SPACING_PX` ⇒ **整层不画**（42 格挤在 12px 里只会糊成灰面，
 *   只留主线反而看得清"缩到哪儿了"）；
 * - 主线：间距 < `MIN_MAJOR_SPACING_PX` ⇒ 不画（防御性下限，正常到不了）；
 * - 轴标：主线间距 < `MIN_LABEL_SPACING_PX` ⇒ 不画（数字叠在一起比没有更糟）；
 * - 视口外的线一律不画（放大后 42 条里通常只有几条可见）。
 *
 * 清屏与底色不在这里（`paintScene` 在屏幕空间统一铺满**视口**），本层只画线。
 */
import { axisTicks, canvasSize, lineCount, worldSize } from './geometry.js';
import type { GridLayout } from './geometry.js';
import type { GridPalette } from './palette.js';
import type { Pose } from './pose.js';
import { HAIRLINE_PX, snapLine } from './snap.js';

/** 细线的最小屏幕间距：低于它细线会糊成灰面（42 格 × 0.5 缩放下只有 5px）。 */
export const MIN_MINOR_SPACING_PX = 6;
/** 主线的最小屏幕间距（防御性：主线间距是细线的 `majorStep` 倍，正常远大于此）。 */
export const MIN_MAJOR_SPACING_PX = 3;
/** 轴标的最小间距：数字叠在一起比不画更糟。 */
export const MIN_LABEL_SPACING_PX = 18;
/** 轴标离网格边界的距离（CSS px）。 */
const LABEL_GAP_PX = 7;

/** 绘制所需的最小 2D 上下文（方法与属性都是 `CanvasRenderingContext2D` 的真子集）。 */
export type GridPaintContext2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'setTransform'
  | 'clearRect'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'arc'
  | 'setLineDash'
  | 'fillText'
  | 'measureText'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalAlpha'
>;

export interface GridPaintInput {
  layout: GridLayout;
  palette: GridPalette;
  /** 视图位姿：内容坐标 → 屏幕坐标（本层用它算位置，但不接它的缩放去改线宽/字号） */
  pose: Pose;
  /** 视口（画布 CSS 尺寸）：用于剔除视口外的线、决定自适应层级 */
  viewW: number;
  viewH: number;
  /** 设备像素比：对齐用 */
  dpr: number;
  /** 主线间隔（格）；`≤ 0` / 非数 ⇒ 只画两端 */
  majorStep: number;
  /** 轴标字号（CSS 像素，**不随缩放变化**）；`≤ 0` ⇒ 不画轴标 */
  fontPx: number;
  fontFamily: string;
}

/**
 * @returns 几何是否可用。`false` = 尺寸未知 / 空间不足（此时一条线都没画；底色由调用方铺）。
 */
export function paintGrid(ctx: GridPaintContext2D, input: GridPaintInput): boolean {
  const { layout, pose, viewW, viewH, dpr, palette, majorStep, fontPx, fontFamily } = input;
  const { w, h } = canvasSize(layout);
  if (!(w > 0 && h > 0)) return false;

  // 自己把变换摆成屏幕空间：本层的坐标已经是屏幕坐标，免得调用方忘了设
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  paintLines(ctx, input);
  if (fontPx > 0) paintAxisLabels(ctx, input);

  ctx.restore();
  return true;
}

/** 内容坐标 → 屏幕坐标（未对齐） */
const project = (content: number, offset: number, scale: number): number => offset + content * scale;

/** 视口内（含 1px 余量，免得边界线被剔掉） */
const visible = (pos: number, limit: number): boolean => pos >= -1 && pos <= limit + 1;

/**
 * 细线一遍、主线一遍：两条 path、两次 `stroke`，与格子数无关。
 * 位置逐条对齐设备像素（`snapLine`），所以任何缩放下都是 1px 的脆线。
 */
function paintLines(ctx: GridPaintContext2D, input: GridPaintInput): void {
  const { layout, pose, viewW, viewH, dpr, palette, majorStep } = input;
  const scale = pose.scale;
  const nx = lineCount(layout.cols);
  const ny = lineCount(layout.rows);
  /** 第 i 条竖线的屏幕 x / 第 i 条横线的屏幕 y（已对齐） */
  const sx = (i: number): number => snapLine(project(layout.pad + i * layout.cellPx, pose.offsetX, scale), dpr);
  const sy = (i: number): number => snapLine(project(layout.pad + i * layout.cellPx, pose.offsetY, scale), dpr);

  // 网格自身的边界：先截到视口内（放大后网格远大于视口），再对齐设备像素
  const rawTop = Math.max(-1, project(layout.pad, pose.offsetY, scale));
  const rawBottom = Math.min(
    viewH + 1,
    project(layout.pad + worldSize(layout.rows, layout.cellPx), pose.offsetY, scale),
  );
  const rawLeft = Math.max(-1, project(layout.pad, pose.offsetX, scale));
  const rawRight = Math.min(
    viewW + 1,
    project(layout.pad + worldSize(layout.cols, layout.cellPx), pose.offsetX, scale),
  );
  if (rawBottom <= rawTop || rawRight <= rawLeft) return; // 整个网格在视口外
  // 端点也走同一套对齐 ⇒ 四条边与首末格线的落点**逐像素一致**，角上不会差半个像素
  const top = snapLine(rawTop, dpr);
  const bottom = snapLine(rawBottom, dpr);
  const left = snapLine(rawLeft, dpr);
  const right = snapLine(rawRight, dpr);

  ctx.globalAlpha = 1;
  ctx.lineWidth = HAIRLINE_PX; // 屏幕空间 ⇒ 不乘 scale：线宽恒定
  ctx.setLineDash([]); // 虚线是上下文状态，不依赖别人 restore 干净

  const spacing = layout.cellPx * scale;
  const ticksX = axisTicks(layout.cols, majorStep);
  const ticksY = axisTicks(layout.rows, majorStep);

  // 细线（含主线位置，主线随后叠上去压住）
  if (spacing >= MIN_MINOR_SPACING_PX) {
    ctx.beginPath();
    for (let i = 0; i < nx; i += 1) {
      const x = sx(i);
      if (visible(x, viewW)) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
    }
    for (let i = 0; i < ny; i += 1) {
      const y = sy(i);
      if (visible(y, viewH)) {
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
    }
    ctx.strokeStyle = palette.minor;
    ctx.stroke();
  }

  // 主线：更深的颜色，用来数格子（不加粗 —— 粗细留给"看得见/看不见"这一个语义）
  if (spacing * majorStep >= MIN_MAJOR_SPACING_PX) {
    ctx.beginPath();
    for (const i of ticksX) {
      const x = sx(i);
      if (visible(x, viewW)) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
    }
    for (const i of ticksY) {
      const y = sy(i);
      if (visible(y, viewH)) {
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
    }
    ctx.strokeStyle = palette.major;
    ctx.stroke();
  }
}

/**
 * 轴标：列标压在网格上边界外、行标压在左边界外；刻度与主线同一组索引
 * ⇒「数第几条主线」= 刻度值。字号恒定，所以缩放只改变数字的**位置**。
 */
function paintAxisLabels(ctx: GridPaintContext2D, input: GridPaintInput): void {
  const { layout, pose, viewW, viewH, dpr, palette, majorStep, fontPx, fontFamily } = input;
  const scale = pose.scale;
  if (layout.cellPx * scale * majorStep < MIN_LABEL_SPACING_PX) return;

  const gridTop = snapLine(project(layout.pad, pose.offsetY, scale), dpr);
  const gridLeft = snapLine(project(layout.pad, pose.offsetX, scale), dpr);
  const showCols = visible(gridTop - LABEL_GAP_PX, viewH);
  const showRows = visible(gridLeft - LABEL_GAP_PX, viewW);
  if (!showCols && !showRows) return;

  ctx.font = `${fontPx}px ${fontFamily}`;
  ctx.fillStyle = palette.axisText;

  if (showCols) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const i of axisTicks(layout.cols, majorStep)) {
      const x = snapLine(project(layout.pad + i * layout.cellPx, pose.offsetX, scale), dpr);
      if (visible(x, viewW)) ctx.fillText(String(i), x, gridTop - LABEL_GAP_PX);
    }
  }

  if (showRows) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const i of axisTicks(layout.rows, majorStep)) {
      const y = snapLine(project(layout.pad + i * layout.cellPx, pose.offsetY, scale), dpr);
      if (visible(y, viewH)) ctx.fillText(String(i), gridLeft - LABEL_GAP_PX, y);
    }
  }
}
