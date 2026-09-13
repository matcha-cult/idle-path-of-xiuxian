/**
 * `scripts/lib/map-edges.mjs` 的**类型声明**（给 `tsc -p tsconfig.test.json` 用）。
 *
 * 派生逻辑本体是 `.mjs`（生成器直接 `node` 跑），单测需要 import 它 ——
 * 没有声明文件时 `noImplicitAny` 会报 TS7016。
 */

import type { Cell, LayoutEdgeInput, LayoutNodeInput } from './map-layout.d.mts';

export declare const RING_STEP: Readonly<Record<string, number>>;
export declare function normalizeAngle(deg: number): number;
export declare function angularDistance(a: number, b: number): number;
export declare function centerOf(
  cell: ReadonlyMap<string, Cell>,
  nodes: readonly LayoutNodeInput[],
): Cell;
export declare function angleOf(
  cell: ReadonlyMap<string, Cell>,
  code: string,
  center: Cell,
): number | null;
export declare function nearestIn(
  list: readonly LayoutNodeInput[],
  angle: ReadonlyMap<string, number | null>,
  code: string,
  k: number,
): LayoutNodeInput[];
export declare function deriveEdges(
  cell: ReadonlyMap<string, Cell>,
  nodes: readonly LayoutNodeInput[],
): LayoutEdgeInput[];
export declare function checkEdgeStructure(
  edges: readonly LayoutEdgeInput[],
  nodes: readonly LayoutNodeInput[],
  cell: ReadonlyMap<string, Cell>,
): string[];
