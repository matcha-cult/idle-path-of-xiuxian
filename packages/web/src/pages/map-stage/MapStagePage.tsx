/**
 * `MapStagePage` —— **地图重做的入口页**（`?mapStage=1`）。
 *
 * ## 这一页到目前画了什么
 * 1. 纵横 `MAP_CELLS` 个小格子的网格（鼠标移到哪一格就报出那一格）；
 * 2. 以中心为圆心、半径可**用滑杆调**的轨道环（外环 = 宗门大阵圈虚线 · 二环 = 八峰轨道）；
 * 3. 中心主峰 + 二环上按 8 等分（相位 22.5°）的 8 个八峰 + 四正方向的 4 座宗门门 ——
 *    共 13 个点，都画成直径 1 格的实心圆。
 *
 * ## 刻意不做什么
 * 不含任何地图业务数据（节点/连线的真实拓扑来自后端 seed，这里只是"看着对不对"）。用户的方式是
 * 「一步步引导」：地基没验穿之前，往上叠的每一层都会把几何错误伪装成「手感问题」——上一轮就是这么丢的。
 *
 * ## 口径
 * - 点位的**存放方式**见 `map-points.ts`：环存半径、点存「环 + 角度」，坐标是派生的；
 * - 本页**不依赖任何 store**（无登录态、无面板数据），所以能脱离后端单独打开验证；
 * - 画布**整图适配**容器，格子取整数（半像素会让 1px 线发虚）；缩放/平移是**视图位姿**
 *   （`scale` + 偏移），位姿在手势期间**不进 React**，所以这里只拿到"手势停下时"的快照（读数用）；
 * - 主题切换按钮由 `App.tsx` 挂（本页故意不引 store），亮暗两套 token 都要在画布上各看一遍。
 */
import { useMemo, useState } from 'react';
import { Button, Space, Typography, theme } from 'antd';
import { CanvasGrid } from '@idle-path/ui-kit';
import type { GridCell, GridMetrics, Pose } from '@idle-path/ui-kit';
import { MapStageReadout } from './MapStageReadout.js';
import { MapStageRingSliders } from './MapStageRingSliders.js';
import {
  MAP_CELLS,
  MAP_POINTS,
  PEAK_COUNT,
  PEAK_PHASE_DEG,
  adjustableRings,
  defaultRingRadii,
  resolveMapLinks,
  resolveMapPoints,
  toGridLinks,
  toGridMarks,
  toGridRings,
  withRingRadii,
} from './map-points.js';

export function MapStagePage() {
  const { token } = theme.useToken();
  const [hover, setHover] = useState<GridCell | null>(null);
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);
  /**
   * 视图位姿（`onPose`）：**只在手势停下时**更新一次（滚轮 300ms 防抖）。
   * 它只用于读数与「重置视图」的可用性判断 —— 画面上的缩放平移**不经过**它。
   */
  const [pose, setPose] = useState<Pose | null>(null);
  /**
   * 复位用**令牌**而不是回调：位姿不在 React state 里（那是手感的关键），
   * 所以"回到整图适配"只能靠这个递增的数字通知画布内部执行一次命令式复位。
   */
  const [resetToken, setResetToken] = useState(0);
  /**
   * 点的**悬停 / 选中**都是**会话态**（与环半径同类）：悬停瞬时、选中常驻。
   * 画布是受控的（`hoverKey` / `selectedKey`），所以点空白取消选中、以后从右侧面板
   * 反向选中某个点，都只是改这两个 state 之一。
   */
  const [hoverMark, setHoverMark] = useState<string | null>(null);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  /**
   * 环半径的**会话态**（滑杆）。初始值 = 数据表里的默认值；刷新即回到默认。
   * 调半径只影响这一份 state，不动数据表 —— 定稿后再把数字写回 `map-points.ts`。
   */
  const [ringRadii, setRingRadii] = useState<Record<string, number>>(() => defaultRingRadii());

  const rings = useMemo(() => withRingRadii(ringRadii), [ringRadii]);
  // 点位是「静态表 + 纯函数派生」：环变了就重算。useMemo 同时保证引用稳定，
  // 否则每次渲染都造新数组，会把画布的绘制 effect 白白打醒。
  const points = useMemo(() => resolveMapPoints(MAP_POINTS, rings), [rings]);
  const gridRings = useMemo(() => toGridRings(rings), [rings]);
  const marks = useMemo(() => toGridMarks(points), [points]);
  // 连接线由**规则**算出（`map-links.ts`）：半径/隐藏位一变，边自动跟着变
  const links = useMemo(() => resolveMapLinks(points), [points]);
  const gridLinks = useMemo(() => toGridLinks(links), [links]);

  const handleRingChange = (ringKey: string, radiusCells: number): void => {
    setRingRadii((prev) => ({ ...prev, [ringKey]: radiusCells }));
  };

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
          地图 · 网格 / 轨道 / 八峰 / 四门 / 连接线
        </Typography.Title>
        <Typography.Text type="secondary">
          每轴 {MAP_CELLS} 个小格子（每轴 {MAP_CELLS + 1} 条网格线）；鼠标移到网格上会高亮，并在光标旁报出坐标。
          主峰在中心；二环按 8 等分排出 {PEAK_COUNT} 个八峰（相位 {PEAK_PHASE_DEG}
          ° ⇒ 错开半个扇区，把四个正方向让出来）；外环是宗门大阵圈（虚线），四门在正北/正东/正南/正西；
          内环也是 8 等分，其中<span> </span>
          四正是四院、四隅是**预留位**（数据保留、暂不渲染，读数里能看到它们存在）。
          连线（灰）按**规则**生成：主峰辐条 · 四院方环 · 峰-院就近 · 八峰环 · 峰-门就近。
          <span> </span>
          <Typography.Text strong>点可以交互</Typography.Text>：鼠标移到点上会亮出名字，点一下选中（点亮常驻圈），点空白取消。
          下面的滑杆可以直接调各环离中心多少格（连线会跟着变）。
        </Typography.Text>
      </div>

      <Space wrap>
        <Button type="primary" data-testid="stage-reset-view" onClick={() => setResetToken((value) => value + 1)}>
          重置视图
        </Button>
        <Typography.Text type="secondary" data-testid="stage-view-hint">
          <Typography.Text strong>滚轮</Typography.Text> = 以鼠标为锚点缩放（0.5×–8×；到上下限就把滚轮
          还给页面，不会把画布变成滚轮黑洞）；<Typography.Text strong>按住拖动</Typography.Text> =
          平移（松手有惯性，撞到边界就停）。缩放平移**不**改变点位数据，命中判定跟着视图走；
          下面的读数里「缩放 / 原点屏幕」就是当前视图。
        </Typography.Text>
      </Space>

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
          onPose={setPose}
          resetToken={resetToken}
          rings={gridRings}
          marks={marks}
          links={gridLinks}
          hoverKey={hoverMark}
          selectedKey={selectedMark}
          onHoverMark={setHoverMark}
          onMarkClick={setSelectedMark}
          label="地图网格"
        />
      </div>

      <MapStageRingSliders rings={adjustableRings(rings)} onChange={handleRingChange} />
      <MapStageReadout
        hover={hover}
        metrics={metrics}
        pose={pose}
        points={points}
        rings={rings}
        links={links}
        hoverMark={hoverMark}
        selectedMark={selectedMark}
      />
    </div>
  );
}
