/**
 * `CanvasGrid` 的**几何纯函数** —— 零 React、零 DOM，可脱离浏览器单测。
 *
 * 口径（地图重做第一步：纵横 42 个小格子）：
 * - `rows` / `cols` 数的是**格子**（42），所以每轴**网格线是 43 条**（索引 0..42）；
 * - 格子坐标 **0-based**：`col ∈ [0, cols-1]`、`row ∈ [0, rows-1]`；
 * - 世界原点落在画布内的 `(pad, pad)`：`pad` 是给轴标留的内边距，**不属于任何格子**，
 *   因此「点在 pad 区域里」= 不在任何格子上（返回 null），而不是把边界格撑大；
 * - **非法输入一律返回 null / 0，绝不返回 NaN**。上一轮的教训：NaN 流进 canvas 不会抛错，
 *   只会静默地什么都不画 —— 那种「白屏」是最难查的一类故障，所以这里用类型层面的空值表达。
 */

/** 格子坐标（0-based，单位是「第几格」而不是像素）。 */
export interface GridCell {
  col: number;
  row: number;
}

/** 画布几何：格子数 + 每格像素 + 内边距。`cellPx = 0` 表示「空间不足 / 尺寸未知」。 */
export interface GridLayout {
  rows: number;
  cols: number;
  cellPx: number;
  pad: number;
}

/** 矩形（画布 CSS 像素坐标系，原点在画布左上角）。 */
export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 轴标内边距：够放 2~3 位数字的字号（轴标压在网格外侧）。 */
export const GRID_PAD_PX = 26;

/** 每格像素下限：再小就糊成一片，不如不画（由调用方显示「空间不足」）。 */
export const MIN_CELL_PX = 4;

/** 每轴网格线数量：n 个格子 ⇒ n+1 条线（0..n）；`n ≤ 0` / 非数 ⇒ 0。 */
export function lineCount(cells: number): number {
  return Number.isFinite(cells) && cells > 0 ? Math.floor(cells) + 1 : 0;
}

/** 网格世界尺寸（**不含** pad）；非法输入 ⇒ 0。 */
export function worldSize(cells: number, cellPx: number): number {
  if (!Number.isFinite(cells) || !Number.isFinite(cellPx) || cells <= 0 || cellPx <= 0) return 0;
  return Math.floor(cells) * cellPx;
}

/** 几何是否可用（尺寸未知 / 空间不足时统一为不可用）。 */
export function isLayoutUsable(layout: GridLayout): boolean {
  const { rows, cols, cellPx, pad } = layout;
  if (![rows, cols, cellPx, pad].every((v) => Number.isFinite(v))) return false;
  return rows > 0 && cols > 0 && cellPx > 0 && pad >= 0;
}

/** 格子是否在网格内（`isLayoutUsable` 之外还要单独判，因为高亮格来自外部 props）。 */
export function isCellInside(cell: GridCell, layout: GridLayout): boolean {
  if (!Number.isFinite(cell.col) || !Number.isFinite(cell.row)) return false;
  return cell.col >= 0 && cell.row >= 0 && cell.col < layout.cols && cell.row < layout.rows;
}

/**
 * 在可用空间内求**整数**格宽（整图适配）。
 *
 * 取整有两个理由：半像素格宽会让 1px 线条发虚（用户明确抱怨过「线条歪歪斜斜」）；
 * 且整数格宽下 `floor(x / cellPx)` 在边界上不会有浮点抖动。
 *
 * @returns 每格 CSS 像素；`0` = 空间不足（小于 `minCellPx`）或输入非法。
 */
export function fitCellPx(input: {
  availW: number;
  availH: number;
  rows: number;
  cols: number;
  pad: number;
  minCellPx?: number;
}): number {
  const { availW, availH, rows, cols, pad, minCellPx = MIN_CELL_PX } = input;
  if (![availW, availH, rows, cols, pad, minCellPx].every((v) => Number.isFinite(v))) return 0;
  if (rows <= 0 || cols <= 0 || pad < 0) return 0;
  const usableW = availW - pad * 2;
  const usableH = availH - pad * 2;
  if (usableW <= 0 || usableH <= 0) return 0;
  const cellPx = Math.floor(Math.min(usableW / cols, usableH / rows));
  return cellPx >= minCellPx ? cellPx : 0;
}

/** 画布 CSS 尺寸（含两侧 pad）；不可用 ⇒ 0×0（画布退化为不可见，而不是一张幽灵白图）。 */
export function canvasSize(layout: GridLayout): { w: number; h: number } {
  if (!isLayoutUsable(layout)) return { w: 0, h: 0 };
  return {
    w: worldSize(layout.cols, layout.cellPx) + layout.pad * 2,
    h: worldSize(layout.rows, layout.cellPx) + layout.pad * 2,
  };
}

/**
 * 画布 CSS 像素点 → 格子。
 *
 * 边界（都有单测）：`pad` 区域 / 网格右侧与下方的 pad 区域 ⇒ null；`x === 世界宽` 也算出界
 * （右边界线属于「线」不属于「格」）；NaN / Infinity / 不可用几何 ⇒ null。
 */
export function cellAtPoint(px: number, py: number, layout: GridLayout): GridCell | null {
  if (!isLayoutUsable(layout) || !Number.isFinite(px) || !Number.isFinite(py)) return null;
  const x = px - layout.pad;
  const y = py - layout.pad;
  const worldW = worldSize(layout.cols, layout.cellPx);
  const worldH = worldSize(layout.rows, layout.cellPx);
  if (x < 0 || y < 0 || x >= worldW || y >= worldH) return null;
  return {
    col: Math.min(layout.cols - 1, Math.floor(x / layout.cellPx)),
    row: Math.min(layout.rows - 1, Math.floor(y / layout.cellPx)),
  };
}

/** 格子 → 画布 CSS 像素矩形；越界 / 不可用 ⇒ null。 */
export function cellRect(cell: GridCell, layout: GridLayout): GridRect | null {
  if (!isLayoutUsable(layout) || !isCellInside(cell, layout)) return null;
  return {
    x: layout.pad + cell.col * layout.cellPx,
    y: layout.pad + cell.row * layout.cellPx,
    w: layout.cellPx,
    h: layout.cellPx,
  };
}

/**
 * 轴标索引：`0, step, 2×step, …, cells`（末格不是 step 整数倍时补上，否则最右/最下的刻度会缺）。
 * `step ≤ 0` / 非数 ⇒ 只画两端 `[0, cells]`；`cells ≤ 0` ⇒ 空数组。
 */
export function axisTicks(cells: number, step: number): number[] {
  const n = Number.isFinite(cells) && cells > 0 ? Math.floor(cells) : 0;
  if (n === 0) return [];
  const s = Number.isFinite(step) && step > 0 ? Math.floor(step) : 0;
  if (s === 0) return [0, n];
  const out: number[] = [];
  for (let v = 0; v <= n; v += s) out.push(v);
  if (out[out.length - 1] !== n) out.push(n);
  return out;
}

/**
 * 1px 线条的**清晰化**坐标：画在整数 + 0.5 上，奇数线宽才不会跨两个像素发虚。
 * 这是纯 canvas 路线必须自己做、而 SVG/DOM 白送的一步。
 */
export function crisp(v: number): number {
  return Math.round(v) + 0.5;
}

/**
 * 两个格子是否同一格 —— hover 去重用。
 *
 * `null`（不在任何格子上）与越界值都归一成「没有格子」，因此 `null == null` 为真：
 * 「一直不在格子上」不会被重复上报。放在几何层是因为它只依赖坐标本身，
 * 与渲染无关，且必须和 `cellAtPoint` 的边界口径完全一致。
 */
export function sameCell(a: GridCell | null, b: GridCell | null): boolean {
  return (a?.col ?? -1) === (b?.col ?? -1) && (a?.row ?? -1) === (b?.row ?? -1);
}

/** 画布内坐标标签的文字：用逗号而非「列/行」，小字号下更省地方。 */
export function cellLabel(cell: GridCell): string {
  return `${cell.col},${cell.row}`;
}
