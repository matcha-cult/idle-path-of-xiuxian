/**
 * `scripts/lib/map-layout.mjs` 的**类型声明**（给 `tsc -p tsconfig.test.json` 用）。
 *
 * 落格算法本体是 `.mjs`（生成器 `gen-map-seed.mjs` 直接 `node` 跑，不经过 tsc），
 * 单测需要 import 它 —— 没有声明文件时 `noImplicitAny` 会报 TS7016。
 * 这里只声明测试用到的形状，字段刻意从宽（算法吃的是纯数据对象）。
 */

/** 参与落格的节点（只需要这几个字段，其余原样透传）。 */
export interface LayoutNodeInput {
  code: string;
  ring: string;
  sector?: string | null;
  orderIndex?: number;
}

/** 参与落格的边（`bidirectional === false` 时只认 from → to）。 */
export interface LayoutEdgeInput {
  fromNodeCode: string;
  toNodeCode: string;
  bidirectional?: boolean;
}

export interface Cell {
  row: number;
  col: number;
}

export interface LayoutResult {
  cell: Map<string, Cell>;
  ideal: Map<string, Cell>;
  offsets: Map<string, number>;
  maxOffset: number;
  sep: number;
  arc: number;
}

export interface LayoutInput {
  n: number;
  nodes: readonly LayoutNodeInput[];
  edges?: readonly LayoutEdgeInput[];
  sep?: number;
  arc?: number;
}

export declare function layoutNodes(input: LayoutInput): LayoutResult | null;
export declare function polarFor(
  n: number,
  node: LayoutNodeInput & { peers?: Map<string, number> | Record<string, number> },
  arcPerNode?: number,
): { r: number; a: number };
export declare function polarToCell(n: number, polar: { r: number; a: number }): Cell;
export declare function ringRank(ring: string): number;
export declare function snapError(layout: LayoutResult): { max: number; mean: number; worst: string | null };
export declare function peaksRadialDeviation(
  layout: LayoutResult,
  nodes: readonly LayoutNodeInput[],
  n: number,
): number;
export declare function minGap(
  layout: LayoutResult,
  edges: readonly LayoutEdgeInput[],
): { min: number; pair: [string, string] | null };
export declare function edgeSpanHistogram(
  layout: LayoutResult,
  edges: readonly LayoutEdgeInput[],
): {
  histogram: Record<string, number>;
  max: number;
  spans: Array<{ edge: LayoutEdgeInput; span: number }>;
};
export declare function crossingPairs(
  layout: LayoutResult,
  edges: readonly LayoutEdgeInput[],
): Array<[string, string]>;
export declare const SECTOR_ANGLE: Readonly<Record<string, number>>;
export declare const INNER_LAYER: Readonly<Record<string, number>>;
