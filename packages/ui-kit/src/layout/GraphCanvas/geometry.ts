/**
 * `GraphCanvas` 的**纯几何函数**（不 render，单独成文件便于单测）。
 *
 * 两层缩放口径（`14-地图画布方案探讨.md` §14.3）：底图 / 连线 / 网格跟随 `zoom`，
 * **枢纽图标恒定屏幕尺寸** —— 所以枢纽定位用 `col * cellPx * zoom + pan`，图标自身不缩。
 *
 * 所有函数都是防御式的：非有限数 / 非法尺寸一律收敛到安全值，绝不产出 `NaN` 坐标
 * （`NaN` 会让整块画布从屏幕上消失，且没有任何报错）。
 */

export const DEFAULT_CELL_PX = 48;
/** 缩放上限：整图适配后再放大 4 倍。 */
export const MAX_ZOOM_FACTOR = 4;
/** 拖动判定阈值（px）：pointer 位移超过它视为拖动，不触发选中（§12.2）。 */
export const DRAG_THRESHOLD_PX = 8;

/** 任意入参 → 有限数；`NaN` / `±Infinity` / `undefined` → 缺省值。 */
export function finite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 合法格像素：必须为正的有限数，否则回退缺省 48。 */
export function safeCellPx(cellPx: number | undefined): number {
  const n = finite(cellPx, DEFAULT_CELL_PX);
  return n > 0 ? n : DEFAULT_CELL_PX;
}

/** 交叉线条数 → 世界边长（px）：`(n + 1) * cellPx`；非法 `n` 视为 0 条 → 至少 1 格。 */
export function worldSize(n: number, cellPx: number): number {
  const count = Math.max(0, Math.trunc(finite(n, 0)));
  return (count + 1) * safeCellPx(cellPx);
}

/**
 * 整图适配缩放 `zoom_fit`：`min(容器宽 / 世界宽, 容器高 / 世界高)`。
 * 容器尺寸未知（0 / NaN）时回退 1（不放大也不缩没）。
 */
export function fitZoom(
  worldW: number,
  worldH: number,
  viewW: number,
  viewH: number,
): number {
  const w = worldSize(0, 0); // 兜底：避免 worldW/H 为 0 时除零
  const safeW = finite(worldW, w) > 0 ? finite(worldW, w) : w;
  const safeH = finite(worldH, w) > 0 ? finite(worldH, w) : w;
  const vw = finite(viewW, 0);
  const vh = finite(viewH, 0);
  if (vw <= 0 || vh <= 0) return 1;
  return Math.min(vw / safeW, vh / safeH);
}

/** 把缩放夹在 `[minZoom, maxZoom]`；上下界非法时回退 1。 */
export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
  const z = finite(zoom, 1);
  const lo = finite(minZoom, 1);
  const hi = Math.max(lo, finite(maxZoom, lo));
  return Math.min(hi, Math.max(lo, z));
}

/**
 * 平移夹取：**允许边缘露出一部分**，但不允许把整张图拖出视野。
 *
 * 世界在屏幕上的尺寸是 `size * zoom`。`min` 侧允许最多把图拖到「还剩 `minVisible` px 可见」，
 * `max` 侧同理 —— 这样松手后总能看见图的一角，而不是空白画布。
 */
export function clampPan(
  pan: number,
  size: number,
  zoom: number,
  minVisible = 40,
): number {
  const scaled = finite(size, 0) * finite(zoom, 1);
  const offset = finite(pan, 0);
  if (!(scaled > 0)) return 0;
  const visible = Math.min(Math.max(0, finite(minVisible, 40)), scaled);
  const lo = -(scaled - visible);
  const hi = visible;
  return Math.min(hi, Math.max(lo, offset));
}

/**
 * 以某个锚点缩放：锚点在屏幕上的位置保持不变（`Ctrl + 滚轮` 的直觉）。
 *
 * `pan' = anchor - (anchor - pan) * (zoom' / zoom)`。
 * 旧 zoom 非法（0 / NaN）时平移保持不变。
 */
export function zoomAt(
  pan: number,
  anchor: number,
  oldZoom: number,
  newZoom: number,
): number {
  const from = finite(oldZoom, 0);
  const to = finite(newZoom, 1);
  const base = finite(pan, 0);
  const point = finite(anchor, 0);
  if (!(from > 0)) return base;
  return point - (point - base) * (to / from);
}

/** 枢纽的屏幕位置（图标**不缩放**，所以这里是 `坐标 × cellPx × zoom + pan`）。 */
export function itemScreenPosition(
  row: number,
  col: number,
  cellPx: number,
  zoom: number,
  panX: number,
  panY: number,
): { x: number; y: number } {
  const px = safeCellPx(cellPx);
  const z = finite(zoom, 1);
  return {
    x: finite(col, 0) * px * z + finite(panX, 0),
    y: finite(row, 0) * px * z + finite(panY, 0),
  };
}

/** 该 item 是否值得渲染：key 非空、坐标有限。越界坐标仍渲染（开发者网格要能看见越界）。 */
export function isRenderableItem(row: number, col: number): boolean {
  return Number.isFinite(row) && Number.isFinite(col);
}

/**
 * 轴标索引：**0-based 交叉线索引** `0..n`（含两端，共 `n + 1` 条）。
 * `n` 非有限 / 负数 → 只有 `[0]`（一个交叉点也画得出来）。
 */
export function axisIndexes(n: number): number[] {
  const count = Math.max(0, Math.trunc(finite(n, 0)));
  return Array.from({ length: count + 1 }, (_, index) => index);
}

/**
 * 端口位移（`row/col` 的签名与 `itemScreenPosition` 一致，便于成对使用）。
 * 返回该枢纽的 `(row, col)` 文本，供开发者网格标注。
 */
export function coordinateLabel(row: number, col: number): string {
  return `${Math.trunc(finite(row, 0))},${Math.trunc(finite(col, 0))}`;
}

