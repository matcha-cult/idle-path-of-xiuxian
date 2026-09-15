/**
 * 地图点位的**类型契约**（与数据、与派生分开：三个文件各自 < 200 行，且依赖方向单向）。
 *
 * 依赖方向：`map-types` ← `map-catalog`（数据表）← `map-point-query`（派生与滑杆）。
 * `map-points.ts` 只是把三者 re-export 出去，于是调用方仍然 `from './map-points.js'`。
 */
import type { WorldPoint } from '@idle-path/ui-kit';

/**
 * 点位的功能类型。
 * - `court` = 四院（内环四正）；
 * - `reserved` = **预留位置**：内环四隅，位置先占住、暂不启用（配 `hidden` 不渲染）。
 */
export type MapPointKind = 'summit' | 'peak' | 'court' | 'gate' | 'reserved';

/** 环（轨道）：**半径与线型的口径只写在这里**。 */
export interface MapRing {
  key: string;
  /** 显示名（滑杆与读数上用**用户的词汇**：外环/二环/内环，避免各说各话） */
  label: string;
  /** 环半径（格单位） */
  radiusCells: number;
  /** 画成虚线（视觉语言：把「宗门大阵圈」与「八峰轨道」区分开） */
  dashed?: boolean;
  /** 半径**不可调**（中心 = 主峰，恒为 0；滑杆不给它，免得把中心拖出去） */
  fixed?: boolean;
  /**
   * 半径在数据表里的**常量名**（如 `GATE_RING_CELLS`）。
   *
   * 用途：滑杆面板的「复制环半径」按它生成 `export const … = …;` 这种**可整段贴回**的源码。
   * 缺省（中心那种固定环）表示"这个半径不需要写回数据表"。
   */
  radiusConst?: string;
}

export interface MapPoint {
  key: string;
  kind: MapPointKind;
  label: string;
  /** 所在环的 `key` */
  ring: string;
  /** 环上角度（度）：0° = 正东、逆时针为正；环心点（半径 0）省略 */
  angleDeg?: number;
  /**
   * **是否隐藏**（用户 2026-09-15 要求的新字段）：`true` = 留在数据里但**不渲染**。
   *
   * 用途：内环四隅那 4 个"先占住位置"的点 —— 位置、角度、归属环都按最终设计写好，
   * 但暂时不画出来。这样以后启用它们只是**去掉一个标记**，而不是重新补数据、重新对齐。
   * 它只影响渲染：`resolveMapPoints` 仍会算出坐标（读数里能看见），只有 `toGridMarks` 过滤它。
   */
  hidden?: boolean;
}

/** 解析后的点：附上**派生值**（世界坐标 + 数据库格点口径）。 */
export interface ResolvedMapPoint extends MapPoint {
  /** 环半径（格单位） */
  radiusCells: number;
  /** 派生：世界坐标（格单位，原点 = 主峰，y 向上） */
  world: WorldPoint;
  /** 派生：数据库格点口径（环上的点大多是小数 —— 这是事实，不要四舍五入掉） */
  lattice: { col: number; row: number };
}
