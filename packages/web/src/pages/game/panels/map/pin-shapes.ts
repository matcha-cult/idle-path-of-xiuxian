/**
 * `MapNodePin` 的**纯几何与环层档位**（不 render，单独成文件便于单测与图例复用）。
 *
 * 规格来源：`19-画布交互修复与视觉规格v2任务书.md` §4/§5（提议稿 `tmp/map-visual-proposal.mjs`）。
 *
 * ## 形状即层级
 * 画布上不再用 glyph 区分节点类型 —— 30~40px 的形状里塞不下 glyph，也没法和名字共存。
 * 四档环层各有一种形状与一种语义色（颜色在 `MapNodePin` 里取 token，本文件只管几何）：
 * `outer` 圆角方 / `peaks` 圆 / `inner` 六边形 / `summit` 八角星（最大）。
 */

/** 环层四档（也是四种形状）。 */
export type RingTier = 'outer' | 'peaks' | 'inner' | 'summit';

/** 四档的展示顺序（外环山门 → 八峰 → 四院 → 中央主峰）。 */
export const RING_TIERS: readonly RingTier[] = ['outer', 'peaks', 'inner', 'summit'];

/**
 * 协议 `ring` 值 → 四档。
 *
 * 边界：`approach`（外门接引）语义上属于「山门」这一档，归入 `outer`；
 * 未知 / 空值兜底到 `peaks` —— **不新增第 5 种形状**（多一种形状就没人记得住）。
 */
export function tierOfRing(ring: string): RingTier {
  if (ring === 'outer' || ring === 'peaks' || ring === 'inner' || ring === 'summit') return ring;
  if (ring === 'approach') return 'outer';
  return 'peaks';
}

/** 视觉直径（px，外接盒边长）：主峰最大（§4 的尺寸表）。 */
export const RING_VISUAL_PX: Record<RingTier, number> = {
  outer: 30,
  peaks: 32,
  inner: 32,
  summit: 40,
};

/** 形状标识（`data-shape`，测试与图例共用同一份真相）。 */
export const RING_SHAPE: Record<RingTier, 'square' | 'circle' | 'hexagon' | 'star'> = {
  outer: 'square',
  peaks: 'circle',
  inner: 'hexagon',
  summit: 'star',
};

/** 形状中文名（图例用；协议值不上屏，这里也不是协议值）。 */
export const RING_SHAPE_LABEL: Record<RingTier, string> = {
  outer: '圆角方',
  peaks: '圆',
  inner: '六边形',
  summit: '八角星',
};

/** 正 `n` 边形顶点（第一个顶点朝正上方，顺时针），外接半径 `r`。 */
export function polygonPoints(cx: number, cy: number, r: number, n: number): string {
  const count = Math.max(3, Math.trunc(n));
  const radius = r > 0 ? r : 0;
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

/** 正 `points` 角星顶点（外半径 `outer` / 内半径 `inner` 交替；八角星用 `points=8`）。 */
export function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
): string {
  const tips = Math.max(3, Math.trunc(points));
  const radius = outer > 0 ? outer : 0;
  const waist = inner > 0 ? inner : 0;
  return Array.from({ length: tips * 2 }, (_, index) => {
    const angle = (Math.PI * index) / tips - Math.PI / 2;
    const r = index % 2 === 0 ? radius : waist;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}
