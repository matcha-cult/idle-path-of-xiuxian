/**
 * `paintGrid` —— 把网格画到 2D 上下文上（**纯函数**：给什么画什么，不读 DOM、不读时间）。
 *
 * 绘制顺序（后画的压前面的）：
 * 1. 清屏 + 铺底色（**总是执行**，即使几何不可用 —— 否则容器里会留着上一帧的残影）；
 * 2. 全部细格线（一条 path、一次 stroke：42×42 也只有 86 条线段）；
 * 3. 主线（每 `majorStep` 格 + 两端，颜色更深，用来数格子）；
 * 4. 轴标（`0, 5, 10, …, 42`，压在网格外侧的 pad 里）；
 * 5. 悬停格（淡填充 + 2px 描边）。
 *
 * 依赖的是从 `CanvasRenderingContext2D` 里 `Pick` 出来的**最小结构**，所以单测给个普通对象
 * 就够了（不必安装原生 `canvas` 包、也不要求 jsdom 支持 `getContext`）。
 */
import { axisTicks, canvasSize, cellRect, crisp, lineCount, worldSize } from './geometry.js';
import type { GridCell, GridLayout } from './geometry.js';
import type { GridPalette } from './palette.js';

/** 绘制所需的最小 2D 上下文（方法与属性都是 `CanvasRenderingContext2D` 的真子集）。 */
export type GridPaintContext2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'clearRect'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
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
  /** 受控高亮格；`null` = 不高亮，越界值会被忽略（不高亮、不抛错） */
  hover: GridCell | null;
  palette: GridPalette;
  /** 主线间隔（格）；`≤ 0` / 非数 ⇒ 只画两端 */
  majorStep: number;
  /** 轴标字号（CSS 像素）；`≤ 0` ⇒ 不画轴标 */
  fontPx: number;
  fontFamily: string;
  /** 悬停格填充的不透明度 */
  hoverAlpha?: number;
}

/**
 * @returns 是否真的画出了网格。`false` = 几何不可用（尺寸未知 / 空间不足），只铺了底色 ——
 *   调用方据此可以显示「空间不足」而不是让用户对着一张白图猜。
 */
export function paintGrid(ctx: GridPaintContext2D, input: GridPaintInput): boolean {
  const { layout, hover, palette, majorStep, fontPx, fontFamily, hoverAlpha = 0.16 } = input;
  const { w, h } = canvasSize(layout);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.clearRect(0, 0, w, h);
  ctx.fillRect(0, 0, w, h);

  const usable = w > 0 && h > 0;
  if (usable) {
    paintLines(ctx, layout, palette, majorStep);
    if (fontPx > 0) paintAxisLabels(ctx, layout, palette, majorStep, fontPx, fontFamily);
    paintHover(ctx, layout, hover, palette, hoverAlpha);
  }

  ctx.restore();
  return usable;
}

/** 细线一条 path 打底，再叠主线（两条 path 共两次 `stroke`，与格子数无关）。 */
function paintLines(
  ctx: GridPaintContext2D,
  layout: GridLayout,
  palette: GridPalette,
  majorStep: number,
): void {
  const nx = lineCount(layout.cols);
  const ny = lineCount(layout.rows);
  const left = crisp(layout.pad);
  const top = crisp(layout.pad);
  const right = crisp(layout.pad + worldSize(layout.cols, layout.cellPx));
  const bottom = crisp(layout.pad + worldSize(layout.rows, layout.cellPx));
  const at = (i: number): number => crisp(layout.pad + i * layout.cellPx);

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (let i = 0; i < nx; i += 1) {
    ctx.moveTo(at(i), top);
    ctx.lineTo(at(i), bottom);
  }
  for (let i = 0; i < ny; i += 1) {
    ctx.moveTo(left, at(i));
    ctx.lineTo(right, at(i));
  }
  ctx.strokeStyle = palette.minor;
  ctx.stroke();

  ctx.beginPath();
  for (const i of axisTicks(layout.cols, majorStep)) {
    ctx.moveTo(at(i), top);
    ctx.lineTo(at(i), bottom);
  }
  for (const i of axisTicks(layout.rows, majorStep)) {
    ctx.moveTo(left, at(i));
    ctx.lineTo(right, at(i));
  }
  ctx.strokeStyle = palette.major;
  ctx.stroke();
}

/** 轴标：列标压在网格上方，行标压在左侧；刻度与主线同一组索引，于是「数第几条主线」= 刻度值。 */
function paintAxisLabels(
  ctx: GridPaintContext2D,
  layout: GridLayout,
  palette: GridPalette,
  majorStep: number,
  fontPx: number,
  fontFamily: string,
): void {
  ctx.font = `${fontPx}px ${fontFamily}`;
  ctx.fillStyle = palette.axisText;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of axisTicks(layout.cols, majorStep)) {
    ctx.fillText(String(i), crisp(layout.pad + i * layout.cellPx), layout.pad - 7);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const i of axisTicks(layout.rows, majorStep)) {
    ctx.fillText(String(i), layout.pad - 7, crisp(layout.pad + i * layout.cellPx));
  }
}

/** 悬停格：淡填充定「哪一格」，描边定「边界在哪」——只填充在浅色主题下几乎看不见。 */
function paintHover(
  ctx: GridPaintContext2D,
  layout: GridLayout,
  hover: GridCell | null,
  palette: GridPalette,
  alpha: number,
): void {
  if (hover === null) return;
  const rect = cellRect(hover, layout);
  if (rect === null) return;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
}
