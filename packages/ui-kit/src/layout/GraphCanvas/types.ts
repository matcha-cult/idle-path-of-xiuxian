/**
 * `GraphCanvas` 的类型契约（零业务、零 store）。
 *
 * 坐标口径（`14-地图画布方案探讨.md` §14.1）：`(row, col)` 是 **0-based 交叉线索引**，
 * 取值 `0..rows` / `0..cols`（含两端）；`(0,0)` 是左上交叉点，右下是 `(rows, cols)`。
 * 像素换算是 `col * cellPx`（世界坐标），再乘 `zoom` 加 `pan` 得到屏幕位置。
 */
import type { ReactNode } from 'react';

/** 枢纽（可点对象）。 */
export interface GraphCanvasItem {
  /** 稳定 key（也是 `links` 引用它的名字）。 */
  key: string;
  /** 0-based 交叉线行索引，`0..rows`。 */
  row: number;
  /** 0-based 交叉线列索引，`0..cols`。 */
  col: number;
  /** 图标内容（由调用方决定长什么样；本组件只负责定位与交互）。 */
  content: ReactNode;
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** 悬停提示 / 无障碍名称。 */
  title?: string;
}

/** 连线（派生自拓扑，不落库）。 */
export interface GraphCanvasLink {
  from: string;
  to: string;
  /** 视觉状态：普通 / 高亮（选中相关）/ 未解锁。 */
  state?: 'normal' | 'active' | 'locked';
}

export interface GraphCanvasProps {
  /** 交叉线行数：合法行索引 `0..rows`。 */
  rows: number;
  /** 交叉线列数：合法列索引 `0..cols`。 */
  cols: number;
  items: readonly GraphCanvasItem[];
  links?: readonly GraphCanvasLink[];
  /** 一格多少像素（世界坐标；缺省 48）。 */
  cellPx?: number;
  /** 开发者网格：交叉点点阵 + 轴标 + 每个 item 的 `(row,col)`（缺省 false）。 */
  showGrid?: boolean;
  /** 点击空白处（不是枢纽）时触发。 */
  onBackgroundClick?: () => void;
  ariaLabel?: string;
}
