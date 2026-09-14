/**
 * `CanvasGraph` 的公开类型（**canvas 混合渲染**版图原语，与 `GraphCanvas` 并列的兄弟实现）。
 *
 * 与 `GraphCanvas` 的关系：两者是**同一套 props 语义的两条渲染路线**，调用方换组件即可换路线。
 * - `GraphCanvas`：SVG 画网格/连线 + `transform: scale()` 的 div 世界层 + 绝对定位枢纽（旧版，保留）；
 * - `CanvasGraph`：**canvas 2D 画网格/连线**（屏幕空间绘制，天然锐利、无文本选择）+ 绝对定位枢纽（DOM）。
 *
 * 两条都守同一条坐标系与两条规矩（`14-...md` §14.1 / §14.3 / §12.1）：
 * 坐标是 **0-based 交叉线索引**；底图/连线跟随 zoom、**枢纽恒定屏幕尺寸**；**点击只选中**。
 *
 * 为什么「混合」：枢纽必须能放 antd 组件（`19-...md` §10 的结论），而网格/连线不需要 DOM
 * —— canvas 只接管它们，枢纽仍是 DOM。这不是「全 canvas」（那条路的代价见 19 §10）。
 */
import type { ReactNode } from 'react';

/** 枢纽被点击的来源：`tap` 单击（只选中）/ `double` 双击（PC 快捷移动，§12.1）。 */
export type CanvasGraphPickSource = 'tap' | 'double';

/** 一个枢纽。`content` 由调用方给（通常是 antd 组件），本原语只管定位与命中。 */
export interface CanvasGraphItem {
  /** 稳定 key（也是 `data-canvas-item` 的值，用于命中判定）。 */
  key: string;
  /** 交叉线索引（0-based，`0..rows` / `0..cols`）。 */
  row: number;
  col: number;
  content: ReactNode;
  /** 悬停标题（无障碍名称也用它）。 */
  title?: string;
  selected?: boolean;
  /** 禁用：不参与命中（点击不改变选中态），并降透明度。 */
  disabled?: boolean;
  onSelect?: (source: CanvasGraphPickSource) => void;
}

/** 一条连线（世界坐标由两端枢纽的 `row/col × cellPx` 派生）。 */
export interface CanvasGraphLink {
  from: string;
  to: string;
  state?: 'normal' | 'active' | 'locked';
}

/** 视口位姿：屏幕位移 = 世界坐标 × `zoom` + `pan`。 */
export interface CanvasGraphPose {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasGraphProps {
  /** 交叉线条数（`grid_rows`）；坐标取值 `0..rows`。 */
  rows: number;
  /** 交叉线条数（`grid_cols`）；坐标取值 `0..cols`。 */
  cols: number;
  /** 一格多少像素（世界坐标的分辨率），缺省 48。 */
  cellPx?: number;
  items: readonly CanvasGraphItem[];
  links?: readonly CanvasGraphLink[];
  /** 叠加开发者点阵与轴标（默认关；canvas 绘制，**不会**被浏览器选中文本）。 */
  showGrid?: boolean;
  ariaLabel?: string;
  onBackgroundClick?: () => void;
  /** 视口位姿变化回调；**只在手势落定后**触发（避免每帧一次 React 提交）。 */
  onPoseChange?: (pose: CanvasGraphPose) => void;
  /** 缩放上限倍率（相对整图适配 `zoom_fit`），缺省 4。 */
  maxZoomFactor?: number;
  /** 是否渲染内置缩放控件（放大 / 缩小 / 整图复位），缺省 true。 */
  showControls?: boolean;
}
