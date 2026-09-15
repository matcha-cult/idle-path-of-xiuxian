/**
 * `MapStagePage` —— **地图重做的入口页**（`?mapStage=1`）。
 *
 * ## 这一页到目前画了什么
 * 1. 纵横 `MAP_CELLS` 个小格子的网格（鼠标移到哪一格就报出那一格）；
 * 2. 以中心为圆心、半径 `PEAK_RING_CELLS` 格的**轨道环**；
 * 3. 环上 **8 等分**定出的 8 个**功能峰** + 中心的**主峰** —— 9 个点都画成直径 1 格的实心圆。
 *
 * ## 刻意不做什么
 * 不含任何地图业务数据（节点/连线/可交互对象/缩放拖拽）。用户的方式是「一步步引导」：
 * 地基没验穿之前，往上叠的每一层都会把几何错误伪装成「手感问题」——上一轮就是这么丢的。
 *
 * ## 口径
 * - 点位的**存放方式**见 `map-points.ts`：环存半径、点存「环 + 角度」，坐标是派生的；
 * - 本页**不依赖任何 store**（无登录态、无面板数据），所以能脱离后端单独打开验证；
 * - 画布**整图适配**容器，格子取整数（半像素会让 1px 线发虚）；
 * - 主题切换按钮由 `App.tsx` 挂（本页故意不引 store），亮暗两套 token 都要在画布上各看一遍。
 */
import { useMemo, useState } from 'react';
import { Typography, theme } from 'antd';
import { CanvasGrid } from '@idle-path/ui-kit';
import type { GridCell, GridMetrics } from '@idle-path/ui-kit';
import { MapStageReadout } from './MapStageReadout.js';
import {
  GATE_RING_CELLS,
  MAP_CELLS,
  PEAK_COUNT,
  PEAK_PHASE_DEG,
  PEAK_RING_CELLS,
  resolveMapPoints,
  toGridMarks,
  toGridRings,
} from './map-points.js';

export function MapStagePage() {
  const { token } = theme.useToken();
  const [hover, setHover] = useState<GridCell | null>(null);
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);

  // 点位是「静态表 + 纯函数派生」：算一次即可。useMemo 同时保证引用稳定，
  // 否则每次渲染都造新数组，会把画布的绘制 effect 白白打醒。
  const points = useMemo(() => resolveMapPoints(), []);
  const rings = useMemo(() => toGridRings(), []);
  const marks = useMemo(() => toGridMarks(points), [points]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: token.padding,
        height: '100vh',
        boxSizing: 'border-box',
        padding: token.padding,
        overflow: 'hidden',
      }}
    >
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          地图 · 网格 / 轨道 / 功能峰 / 四门
        </Typography.Title>
        <Typography.Text type="secondary">
          每轴 {MAP_CELLS} 个小格子（每轴 {MAP_CELLS + 1} 条网格线）；鼠标移到网格上会高亮，并在光标旁报出坐标。
          主峰在中心；外面一圈半径 {PEAK_RING_CELLS} 格的轨道上按 8 等分排出 {PEAK_COUNT} 个功能峰（相位{' '}
          {PEAK_PHASE_DEG}°，即错开半个扇区）；再外面一圈<span> </span>
          {GATE_RING_CELLS} 格的虚线轨道是宗门大阵圈，四门在正北/正东/正南/正西。
        </Typography.Text>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          background: token.colorBgLayout,
          overflow: 'hidden',
        }}
      >
        <CanvasGrid
          rows={MAP_CELLS}
          cols={MAP_CELLS}
          value={hover}
          onHoverCell={setHover}
          onMetrics={setMetrics}
          rings={rings}
          marks={marks}
          label="地图网格"
        />
      </div>

      <MapStageReadout hover={hover} metrics={metrics} points={points} />
    </div>
  );
}
