/**
 * **世界坐标**（地图的几何口径）—— 与「格子索引」刻意分开的一层。
 *
 * ## 口径
 * - 原点 = **大阵中心**（42 格时正是格点 (21,21) 那个交点）；
 * - **x 向右、y 向上**（数学/象限口径，逆时针为正角），单位 = **1 格**；
 * - 42 格 ⇒ 世界范围 −21 … +21（对称，边界判断不用再记"中心在 21"）；
 * - 角度：**0° = 正东**、逆时针为正 ⇒ 90° = 正北、45° = 东北 …… 与后天八卦的八个方位一致。
 *
 * ## 为什么非要单独一层
 * 格索引（0..42）是**数据库与邻接关系的权威**，但它是"左上角为原点、y 向下、且不对称
 * （0..42 的中心在 21）"的口径。画几何（同心圆、8 等分、角度、对称）时，centered + y-up
 * 才是教科书形式。两套口径的换算**只在本文件**：`worldToScreen` 是全项目**唯一**出现
 * y 翻转的地方 —— 一旦负号散落到多处，就会出现"几乎对、但上下镜像"这种最难查的错。
 *
 * ## 与数据的约定
 * 环上的点**只存 (半径, 角度)**，不存 (x, y)：斜向点的 x = 9/√2 是无理数，存下来既难读，
 * 又会在改半径后失效。(x, y) 一律是**派生值**，算出来就用、不落库。
 */

export interface WorldPoint {
  x: number;
  y: number;
}

/** 格点索引（数据库口径：`grid_col` / `grid_row`，0-based，可为小数）。 */
export interface LatticePoint {
  col: number;
  row: number;
}

const DEG = Math.PI / 180;
/** 角度数（8 等分时出现 cos(90°)=6.1e-17 这类浮点渣，不清理就会出现"正北峰的 x 不是 0"）。 */
const PRECISION = 1e9;

function clean(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * PRECISION) / PRECISION;
  return rounded === 0 ? 0 : rounded; // 同时消掉 -0
}

/** 归一化到 `[0, 360)`；非数 ⇒ 0。 */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/**
 * 极坐标 → 世界坐标。`angleDeg`：0° = 正东，逆时针为正。
 * 非法输入（NaN / Infinity / 负半径）⇒ 原点（宁可堆在中心，也不要把 NaN 画进画布）。
 */
export function polarToWorld(radiusCells: number, angleDeg: number): WorldPoint {
  if (!Number.isFinite(radiusCells) || !Number.isFinite(angleDeg) || radiusCells < 0) {
    return { x: 0, y: 0 };
  }
  const rad = angleDeg * DEG;
  return { x: clean(radiusCells * Math.cos(rad)), y: clean(radiusCells * Math.sin(rad)) };
}

/**
 * n 等分的角度表（度）：`phase, phase+step, …, phase+(n−1)×step`，`step = 360/n`。
 *
 * `phaseDeg`（相位）= "第一个点从哪里开始"：**0 ⇒ 有一个点落在正东，且 90° 处正好是正北**
 * （八卦八个方位）。若要让四正方向空出来给"四门"，就用 22.5 —— 这是个常数，改一处全环跟着转。
 */
export function ringAngles(count: number, phaseDeg = 0): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const n = Math.floor(count);
  const phase = Number.isFinite(phaseDeg) ? phaseDeg : 0;
  const step = 360 / n;
  return Array.from({ length: n }, (_, i) => normalizeAngle(phase + i * step));
}

/**
 * 世界坐标 → 画布 CSS 像素。**全项目唯一出现 y 翻转的地方。**
 *
 * `center` 是"世界原点在画布上的位置"（即 `gridCenter(layout)`），`cellPx` 是当前每格像素。
 * 缩放/平移将来只改 `center` 与 `cellPx` 这两个输入，本函数不动 —— 这就是把"手感"与"几何"
 * 解耦的位置。
 */
export function worldToScreen(
  world: WorldPoint,
  center: { x: number; y: number },
  cellPx: number,
): { x: number; y: number } {
  return { x: center.x + world.x * cellPx, y: center.y - world.y * cellPx };
}

/** 世界坐标 → 格点索引（数据库口径）。环上的斜向点会落在小数上，**这正是要暴露的事实**。 */
export function worldToLattice(world: WorldPoint, cols: number, rows: number): LatticePoint {
  return { col: world.x + cols / 2, row: rows / 2 - world.y };
}

/** 格点索引 → 世界坐标（`worldToLattice` 的逆；两者必须严格互为逆运算）。 */
export function latticeToWorld(lattice: LatticePoint, cols: number, rows: number): WorldPoint {
  return { x: lattice.col - cols / 2, y: rows / 2 - lattice.row };
}
