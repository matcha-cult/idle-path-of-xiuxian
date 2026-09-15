/**
 * `CanvasGrid` 的**公开类型契约**（单独一个文件，因为 `index.tsx` 有 200 行红线）。
 *
 * 为什么 `GridMetrics` 属于契约而不是调试残留：纯 canvas 画出来的东西在 DevTools 里
 * **没有 DOM**。要让「看不到浏览器的人」也能判断画布到底画成了什么，组件必须主动把
 * 几何与环境报出来 —— 这不是可选日志，是这个渲染方案的**必要接口**。
 */
import type { GridCell } from './geometry.js';

/** 画布内的指针位置（CSS 像素，相对画布左上角）。 */
export interface GridPoint {
  x: number;
  y: number;
}

/** 几何与环境读数。 */
export interface GridMetrics {
  /** 每格 CSS 像素；0 = 空间不足 / 尺寸未知 */
  cellPx: number;
  /** 画布 CSS 尺寸 */
  width: number;
  height: number;
  /** 画布位图尺寸（= CSS 尺寸 × dpr） */
  bitmapWidth: number;
  bitmapHeight: number;
  dpr: number;
  /** 每轴网格线数量（42 格 ⇒ 43 条） */
  axisLineCount: number;
  /** 是否画出了网格 */
  usable: boolean;
}

export interface CanvasGridProps {
  /** 格子行数（纵向格子数；42 ⇒ 43 条横线） */
  rows: number;
  /** 格子列数（横向格子数；42 ⇒ 43 条竖线） */
  cols: number;
  /** 受控高亮格 */
  value?: GridCell | null;
  /** hover 上报（移出网格 ⇒ null）；**只报变化**，同一格内移动不重复上报 */
  onHoverCell?: (cell: GridCell | null) => void;
  onMetrics?: (metrics: GridMetrics) => void;
  /** 每格像素下限（低于它判定「空间不足」而不画） */
  minCellPx?: number;
  /** 主线 / 轴标间隔（格） */
  majorStep?: number;
  /** 是否在光标旁画「列,行」标签 */
  showCursorLabel?: boolean;
  /** 无障碍名（canvas 内部内容对读屏不可见，这里只报「多大的网格」） */
  label?: string;
}
