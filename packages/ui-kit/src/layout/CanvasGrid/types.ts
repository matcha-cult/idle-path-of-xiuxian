/**
 * `CanvasGrid` 的**公开类型契约**（单独一个文件，因为 `index.tsx` 有 200 行红线）。
 *
 * 为什么 `GridMetrics` 属于契约而不是调试残留：纯 canvas 画出来的东西在 DevTools 里
 * **没有 DOM**。要让「看不到浏览器的人」也能判断画布到底画成了什么，组件必须主动把
 * 几何与环境报出来 —— 这不是可选日志，是这个渲染方案的**必要接口**。
 */
import type { GridCell } from './geometry.js';
import type { Pose } from './pose.js';
import type { WorldPoint } from './world.js';

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
  /** 坐标系中心（画布 CSS 像素）；几何不可用时为 0，调用方应据 `usable` 判断 */
  centerX: number;
  centerY: number;
  /** 是否画出了网格 */
  usable: boolean;
}

/** 参考圆 / 轨道（世界口径：半径以「格」为单位，原点在中心）。 */
export interface GridRing {
  /** 半径（格单位）；`≤ 0` ⇒ 不画（主峰那种"半径 0 的环"因此天然安全） */
  radiusCells: number;
  /** 线宽（CSS 像素），默认 1.5 */
  widthPx?: number;
  /** 虚线（默认实线） */
  dashed?: boolean;
}

/** 功能点（世界口径：位置以「格」为单位，原点在中心，y 向上）。 */
export interface GridMark {
  /** 稳定标识（悬停/点击回调带回来；缺省时退回数组下标 —— 两种都要能工作） */
  key?: string;
  /** 显示名（悬停时画在光标旁；缺省则退回格坐标） */
  label?: string;
  at: WorldPoint;
  /** 点半径（格单位）。口径「直径 = 1 格」⇒ `0.5` —— 口径在数据里，不在组件里 */
  radiusCells: number;
}

/**
 * 连接线（图的边）：两端都是**世界坐标**。
 *
 * 组件只负责"把这两点连起来"，完全不认识拓扑 ——「谁连谁」是数据层的事
 * （web 侧 `map-links.ts` 用规则生成，见那里的说明）。两端重合时绘制层会跳过。
 */
export interface GridLink {
  from: WorldPoint;
  to: WorldPoint;
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
  /** 参考圆 / 轨道（画在网格之上、功能点之下） */
  rings?: readonly GridRing[];
  /** 功能点（实心圆点；压在轨道与悬停高亮之上，直径以「格」为单位） */
  marks?: readonly GridMark[];
  /** 连接线（图的边）：画在轨道之上、功能点之下（点永远盖住线头） */
  links?: readonly GridLink[];
  /**
   * **受控选中**的点 key（常驻聚焦圈；`null` = 没选中）。
   *
   * 与 `value`（高亮格）同一套思路：组件自己不存"选中了谁"，选中态属于业务；
   * 这样点空白取消选中、或从右侧面板反向选中某个点，都只是改一个 prop。
   */
  selectedKey?: string | null;
  /** **受控悬停**的点 key（瞬时聚焦圈）——与 `value`（高亮格）同理，组件不自己存 */
  hoverKey?: string | null;
  /** 悬停到某个点（移出 ⇒ `null`）；**只报变化**，与格子的 `onHoverCell` 各报各的 */
  onHoverMark?: (key: string | null) => void;
  /** 点击某个点（点空白 ⇒ `null`）；"点击"= 按下抬起位移不超过阈值，不会与以后的拖动打架 */
  onMarkClick?: (key: string | null) => void;
  /** 命中半径下限（CSS 像素）：太小的点也要点得着 */
  markHitSlopPx?: number;
  /**
   * 位姿汇报（**手势结束时**，不是每帧）：读数 / 排查用。
   * 拖动与缩放期间位姿在 ref 里、命令式重画，所以这里**不会**每帧触发 React 渲染。
   */
  onPose?: (pose: Pose) => void;
  /**
   * 复位触发器：**递增这个数**就把视图复位成整图适配。
   *
   * 为什么用令牌而不是受控 `pose` + `onPoseChange`：受控意味着每帧都要回写 React
   *（正是要避免的"60 帧 60 次提交"）。复位是低频操作，命令式逃生口最划算。
   */
  resetToken?: number;
  /** 主线 / 轴标间隔（格） */
  majorStep?: number;
  /** 是否在光标旁画「列,行」标签 */
  showCursorLabel?: boolean;
  /** 无障碍名（canvas 内部内容对读屏不可见，这里只报「多大的网格」） */
  label?: string;
}
