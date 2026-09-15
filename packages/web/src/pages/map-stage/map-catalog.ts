/**
 * 地图的**数据表**（静态定义：环 + 点位）。要改地图布局，改这个文件就够了。
 *
 * ## 存放口径（用户 2026-09-15：「从现在开始，你需要考虑每一个点的数据存放方法」）
 *
 * 1. **环（轨道）单独定义，点只引用环**：点存 `ring` + `angleDeg`，半径只写在环上。
 *    「二环从 9 格改成 10 格」改一个数，8 个点全跟着动；若每个点各存一份半径，
 *    就有 8 次改错的机会。
 * 2. **只存极坐标，不存 (x, y)**：斜向点的世界坐标是 `9/√2` 这种无理数，存下来既难读，
 *    又会在改半径后失效。**更关键的是：格点索引根本存不下它** —— r=9、45° 的格点坐标是
 *    `(27.364, 14.636)`，不是整数；相位改成 22.5° 之后**八峰的格点坐标全都不是整数**。
 *    老地图八峰被"吸附"成两种半径、角度最大偏 7.2° 的歪斜，根因就是硬压成整数格点。
 * 3. **`key` 稳定、与显示名解耦**：运行期状态（是否发现 / 是否解锁 / 是否选中）只挂 `key`，
 *    以后改名、换顺序、换方位都不会丢状态。
 * 4. **`hidden` 控制是否渲染**：内环四隅是"先占住位置"的预留位，数据完整、暂不画出来。
 * 5. **与数据库的分工**：数据库的权威是 `grid_col/grid_row`（格索引）+ 邻接关系；
 *    这张表是**渲染与几何**的定义。两者由 `worldToLattice` 一对换算连接（只在一处）。
 *    将来后端要下发点位，只需 `{ key, ring, angleDeg, hidden }` 四个数。
 */
import { ringAngles } from '@idle-path/ui-kit';
import type { MapPoint, MapRing } from './map-types.js';

/** 每轴格子数（地图的几何基础；网格与点位共用这一个数）。 */
export const MAP_CELLS = 42;

/**
 * 三层环的半径（格）—— **2026-09-15 由用户在 `?mapStage=1` 的滑杆上定稿**，
 * 用面板上的「复制环半径」按钮导出后写回这里（三个数：外环 19 / 二环 14 / 内环 9）。
 *
 * 为什么比初值（10/9/5）好：三层真正拉开了（层间距 5 格），一眼能看出"外环—二环—内环"的层次；
 * 外环 19 格仍在网格内（±21 的内接圆以内），四门落在格点 (40,21)/(21,2)/(2,21)/(21,40)。
 */
export const COURT_RING_CELLS = 9;

export const PEAK_RING_CELLS = 14;

export const GATE_RING_CELLS = 19;

/**
 * 环定义，**从外到内**排列（与用户报环顺序一致：外环 → 二环 → 内环 → 中心）。
 * 主峰也建成一条**半径 0 的环**，是为了让所有点走**同一套代码** ——
 * 特殊分支越少，越不容易出现"主峰画了、峰忘了画"这种半成品；
 * 它的 `fixed` 让它不出现在滑杆里（中心不该被拖走），半径 0 的环也由绘制层跳过。
 */
export const MAP_RINGS: readonly MapRing[] = [
  {
    key: 'gate',
    label: '外环 · 四门',
    radiusCells: GATE_RING_CELLS,
    dashed: true,
    radiusConst: 'GATE_RING_CELLS',
  },
  { key: 'peak', label: '二环 · 八峰', radiusCells: PEAK_RING_CELLS, radiusConst: 'PEAK_RING_CELLS' },
  { key: 'court', label: '内环 · 四院', radiusCells: COURT_RING_CELLS, radiusConst: 'COURT_RING_CELLS' },
  { key: 'summit', label: '中心 · 主峰', radiusCells: 0, fixed: true },
];

/** 二环八峰数量（8 等分）。 */
export const PEAK_COUNT = 8;

/** 外环宗门门数量（四个正方向）。 */
export const GATE_COUNT = 4;

/** 内环的位置数（8 等分）与四院数（其中四正方向的 4 个）。 */
export const COURT_SLOT_COUNT = 8;
export const COURT_COUNT = 4;

/**
 * 二环八峰的**相位**（度）：第一颗峰从哪个角度开始。
 *
 * `22.5` ⇒ 整环错开半个扇区，**东西南北四个正方向空出来留给四门**
 *（用户 2026-09-15 定的口径；旧种子数据也是这个相位）。代价是：峰不再落在任何一个
 * 具名方位上，所以它们只能按序号命名。
 */
export const PEAK_PHASE_DEG = 22.5;

/**
 * 二环八峰的名字：**按序号**，不按方位。
 *
 * 为什么不用「东/东北/北…」：那是相位 0 的产物。相位改成 22.5° 后，每颗峰正好落在两个
 * 具名方位**之间**，继续叫「功能峰·东」就是错的 —— 名字跟着口径变，才不会骗人。
 * 另外「功能峰」这个词在本图里指**内环那一层功能区（含四院）**，所以二环这 8 个点统一叫
 * **八峰**，避免和用户自己的词汇打架。正式名称以后由数据表给出，`key` 不受影响。
 */
const PEAK_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八'] as const;

/** 宗门门的名字（四个正方向，按角度递增：0° 东 → 90° 北 → 180° 西 → 270° 南）。 */
const GATE_LABELS = ['东门', '北门', '西门', '南门'] as const;

/** 内环 8 等分的方向名（相位 0 ⇒ 四正是正方向、四隅是对角方向）。 */
const COURT_DIRECTIONS = ['东', '东北', '北', '西北', '西', '西南', '南', '东南'] as const;

/** 功能点半径（格单位）：口径「直径 = 1 格」⇒ `0.5`。所有点位共用同一口径。 */
export const MARK_RADIUS_CELLS = 0.5;

/** 地图点位表（静态定义：只写"是什么、在哪条环、环上几度、是否隐藏"）。 */
export const MAP_POINTS: readonly MapPoint[] = [
  { key: 'summit', kind: 'summit', label: '主峰', ring: 'summit' },
  ...ringAngles(PEAK_COUNT, PEAK_PHASE_DEG).map((angleDeg, index) => ({
    key: `peak_${index + 1}`,
    kind: 'peak' as const,
    label: `八峰·${PEAK_LABELS[index] ?? `#${index + 1}`}`,
    ring: 'peak',
    angleDeg,
  })),
  ...ringAngles(GATE_COUNT, 0).map((angleDeg, index) => ({
    key: `gate_${index + 1}`,
    kind: 'gate' as const,
    label: `宗门·${GATE_LABELS[index] ?? `#${index + 1}`}`,
    ring: 'gate',
    angleDeg,
  })),
  /**
   * 内环 8 等分：**四正 = 四院**（渲染），**四隅 = 预留**（`hidden`，数据保留但不渲染）。
   * 序号按各自的顺序编（court_1..4 / inner_1..4），于是"以后启用预留位"= 去掉一个 `hidden`。
   */
  ...ringAngles(COURT_SLOT_COUNT, 0).map((angleDeg, index) => {
    const direction = COURT_DIRECTIONS[index] ?? `#${index + 1}`;
    const isCourt = angleDeg % 90 === 0;
    const ordinal = isCourt ? index / 2 + 1 : (index + 1) / 2;
    return isCourt
      ? { key: `court_${ordinal}`, kind: 'court' as const, label: `四院·${direction}`, ring: 'court', angleDeg }
      : {
          key: `inner_${ordinal}`,
          kind: 'reserved' as const,
          label: `预留·${direction}`,
          ring: 'court',
          angleDeg,
          hidden: true,
        };
  }),
];
