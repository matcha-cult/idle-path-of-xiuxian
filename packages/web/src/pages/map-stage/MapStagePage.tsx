/**
 * `MapStagePage` —— **地图重做的入口页**（`?mapStage=1`）。
 *
 * ## 这一步交付什么（只有这一件事）
 * 一张纵横 **42 个小格子**的纯 canvas 网格；鼠标移到哪一格，那一格高亮并在光标旁报出坐标，
 * 页面底部同步显示悬停格与几何读数。
 *
 * ## 刻意不做什么（以及为什么）
 * 不含任何地图数据、节点、连线、可交互对象、缩放拖拽。用户的验收方式是「一步步引导」：
 * 地基（坐标系 + 绘制 + 读数）没验穿之前，往上叠的每一层都会把几何错误伪装成「手感问题」——
 * 上一轮就是这么丢掉一整轮的。
 *
 * ## 口径
 * - `rows` / `cols` 数的是**格子**（42）⇒ 每轴 **43 条**网格线；格子坐标 **0-based**；
 * - 本页**不依赖任何 store**（无登录态、无面板数据）：所以它能脱离后端单独打开与验证；
 * - 画布**整图适配**容器，格子取整数（半像素会让 1px 线发虚）；
 * - 主题切换按钮由 `App.tsx` 挂（本页故意不引 store），亮暗两套 token 都要在画布上各看一遍。
 */
import { useState } from 'react';
import { Typography, theme } from 'antd';
import { CanvasGrid } from '@idle-path/ui-kit';
import type { GridCell, GridMetrics } from '@idle-path/ui-kit';
import { MapStageReadout } from './MapStageReadout.js';

/** 每轴格子数（用户口径：纵横 42 个小格子）。 */
const GRID_CELLS = 42;

export function MapStagePage() {
  const { token } = theme.useToken();
  const [hover, setHover] = useState<GridCell | null>(null);
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);

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
          地图 · 第一步：网格与坐标
        </Typography.Title>
        <Typography.Text type="secondary">
          每轴 {GRID_CELLS} 个小格子 ⇒ 每轴 {GRID_CELLS + 1}{' '}
          条网格线；格子坐标 0-based（列 / 行 均为 0–{GRID_CELLS - 1}）。把鼠标移到网格上，当前格会高亮，并在光标旁报出坐标。
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
          rows={GRID_CELLS}
          cols={GRID_CELLS}
          value={hover}
          onHoverCell={setHover}
          onMetrics={setMetrics}
          label="地图网格"
        />
      </div>

      <MapStageReadout hover={hover} metrics={metrics} />
    </div>
  );
}
