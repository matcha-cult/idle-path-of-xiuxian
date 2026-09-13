/**
 * `scripts/lib/map-layout-check.mjs` 的**类型声明**（给 `tsc -p tsconfig.test.json` 用）。
 * 与 `map-layout.d.mts` 同一理由：算法本体是 `.mjs`，单测 import 需要声明。
 */
import type { Cell, LayoutEdgeInput, LayoutNodeInput, LayoutResult } from './map-layout.d.mts';

export interface CheckInput {
  layout: LayoutResult | null;
  nodes: readonly LayoutNodeInput[];
  edges: readonly LayoutEdgeInput[];
  n: number;
  mapCode?: string;
  sep?: number;
}

export interface HintInput {
  layout: LayoutResult | null;
  nodes: readonly LayoutNodeInput[];
  edges: readonly LayoutEdgeInput[];
  n: number;
  snapMax: number;
  snapMean: number;
  spanHistogram?: { histogram: Record<string, number>; max: number; spans: Array<{ edge: LayoutEdgeInput; span: number }> };
  minGap?: { min: number; pair: [string, string] | null };
  crossings?: Array<[string, string]>;
  peaksSigma?: number;
}

export declare function inBounds(cell: Cell | undefined, n: number): boolean;
export declare function adjacencyOf(
  nodes: readonly LayoutNodeInput[],
  edges: readonly LayoutEdgeInput[],
): Map<string, string[]>;
export declare function checkLayoutFailures(input: CheckInput): string[];
export declare function layoutHints(input: HintInput): string[];
export declare const MAX_OFFSET_CELLS: number;
