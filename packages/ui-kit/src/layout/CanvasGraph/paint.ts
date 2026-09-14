/**
 * `CanvasGraph` 的**绘制层**（纯函数：只依赖一个最小 2D 上下文接口）。
 *
 * 为什么收成最小接口而不是直接吃 `CanvasRenderingContext2D`：
 * jsdom **没有实现 `getContext('2d')`**（要另外装原生 `canvas` 包）。收窄接口后，
 * 绘制逻辑可以用一个「记录调用的假 ctx」完整单测 —— 这正是全 canvas 路线被列出的
 * 「测试要 mock canvas」的代价（`19-...md` §10 第 3 条），这里用接口收窄把它压到最低。
 *
 * 绘制口径：
 * - **屏幕空间**绘制（先 `translate(pan)` 再 `scale(zoom)`），因此画布尺寸 = 容器尺寸，
 *   不随世界尺寸膨胀；高 zoom 下网格/连线是**矢量重绘**而不是把位图拉大 → 天然锐利；
 * - 线宽按 `1/zoom` 折算，保证「屏幕像素线宽」恒定（放大不会变成大粗线）；
 * - 轴标在 `restore()` 之后以**屏幕空间**绘制，字号不随 zoom 变化。
 */
import type { CanvasPaintStyle, CanvasStrokeStyle } from './palette.js';

/**
 * 绘制所需的**最小 2D 上下文**：从 `CanvasRenderingContext2D` 里挑出用到的成员。
 *
 * 用 `Pick` 而不是手写一份签名：手写会在 `fillStyle`（`string | CanvasGradient | CanvasPattern`）
 * 这类联合类型上失真，真实的 `ctx` 反而要 `as` 断言才能传进来。`Pick` 保持结构精确 ——
 * 真实 `ctx` 直接可传，测试里喂一个「只实现这几个方法的假对象」也能通过。
 */
export type PaintContext2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'clearRect'
  | 'fillRect'
  | 'translate'
  | 'scale'
  | 'setTransform'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'arc'
  | 'fill'
  | 'fillText'
  | 'setLineDash'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalAlpha'
  | 'font'
>;

/** 一根待绘连线（**世界坐标**，由两端枢纽派生）。 */
export interface SceneSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state?: 'normal' | 'active' | 'locked';
}

export interface PaintSceneOptions {
  rows: number;
  cols: number;
  cellPx: number;
  zoom: number;
  panX: number;
  panY: number;
  /** 视口（容器）尺寸，单位 CSS 像素。 */
  viewW: number;
  viewH: number;
  showGrid: boolean;
  segments: readonly SceneSegment[];
  style: CanvasPaintStyle;
}

/** 取某状态的线型；未知状态按 `normal`。 */
function strokeOf(style: CanvasPaintStyle, state: SceneSegment['state']): CanvasStrokeStyle {
  if (state === 'active') return style.linkActive;
  if (state === 'locked') return style.linkLocked;
  return style.link;
}

/** 画一批线（世界坐标；线宽折算成屏幕恒定）。 */
function paintSegments(ctx: PaintContext2D, segments: readonly SceneSegment[], style: CanvasPaintStyle, zoom: number): void {
  for (const segment of segments) {
    const stroke = strokeOf(style, segment.state);
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = stroke.alpha;
    ctx.lineWidth = stroke.width / zoom;
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 画开发者点阵（网格线 + 交叉点 + 世界外框）。同一路径批量描边 / 填充，避免 441 次独立调用。 */
function paintGrid(ctx: PaintContext2D, options: PaintSceneOptions): void {
  const { rows, cols, cellPx, zoom, style } = options;
  const w = cols * cellPx;
  const h = rows * cellPx;
  ctx.strokeStyle = style.gridLine;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (let c = 0; c <= cols; c += 1) {
    ctx.moveTo(c * cellPx, 0);
    ctx.lineTo(c * cellPx, h);
  }
  for (let r = 0; r <= rows; r += 1) {
    ctx.moveTo(0, r * cellPx);
    ctx.lineTo(w, r * cellPx);
  }
  ctx.stroke();

  ctx.fillStyle = style.gridDot;
  ctx.beginPath();
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      const x = c * cellPx;
      const y = r * cellPx;
      ctx.moveTo(x + 1.5, y);
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  ctx.strokeStyle = style.worldBorder;
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.lineTo(0, 0);
  ctx.stroke();
}

/** 轴标（屏幕空间，字号恒定）：横轴 0..cols、纵轴 0..rows。 */
function paintAxisLabels(ctx: PaintContext2D, options: PaintSceneOptions): void {
  const { rows, cols, cellPx, zoom, panX, panY, viewW, viewH, style } = options;
  ctx.fillStyle = style.axisText;
  ctx.font = `${style.axisFontSize}px sans-serif`;
  for (let c = 0; c <= cols; c += 1) {
    const x = c * cellPx * zoom + panX;
    if (x >= -12 && x <= viewW) ctx.fillText(String(c), x + 2, 12);
  }
  for (let r = 0; r <= rows; r += 1) {
    const y = r * cellPx * zoom + panY;
    if (y >= 10 && y <= viewH) ctx.fillText(String(r), 2, y - 2);
  }
}

/** 画一帧：底色 → 点阵 → 连线 → 轴标。不做任何状态判断（位姿由调用方算好）。 */
export function paintScene(ctx: PaintContext2D, options: PaintSceneOptions): void {
  const { zoom, panX, panY, viewW, viewH, showGrid, segments, style } = options;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);
  if (showGrid) paintGrid(ctx, options);
  paintSegments(ctx, segments, style, zoom);
  ctx.restore();
  if (showGrid) paintAxisLabels(ctx, options);
}

/**
 * 由枢纽坐标 + 连线表派生世界坐标线段；**两端缺一即丢弃**（悬挂边不画到 `(0,0)`）。
 * 与 `GraphCanvasLinks` 同口径（复用不了那份实现是因为它返回 SVG 元素）。
 */
export function resolveSegments(
  items: readonly { key: string; row: number; col: number }[],
  links: readonly { from: string; to: string; state?: SceneSegment['state'] }[],
  cellPx: number,
): SceneSegment[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  return links.flatMap((link) => {
    const from = byKey.get(link.from);
    const to = byKey.get(link.to);
    if (from === undefined || to === undefined) return [];
    return [
      {
        x1: from.col * cellPx,
        y1: from.row * cellPx,
        x2: to.col * cellPx,
        y2: to.row * cellPx,
        state: link.state,
      },
    ];
  });
}
