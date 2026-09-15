/**
 * `CanvasGrid` —— **画布上的等宽格子网格 + 地图内容**（坐标系 / 轨道 / 连线 / 功能点 / 交互）。
 *
 * ## 四套坐标，各有一段唯一的变换
 * ```
 * 世界坐标 --worldToScreen--> 内容坐标 --pose--> 屏幕坐标 --dpr--> 位图
 * (格，y 向上)              (fit 布局，y 向下)        (用户看到的)
 * ```
 * 每段只有一处做变换，所以命中测试只要按同一条链**反向**走一遍就必然对得上
 * （`use-grid-pointers` 里 `toContent` 一次逆变换，之后与没有缩放时完全一样）。
 *
 * ## 什么跟着缩放、什么不跟（分错了就会"越放越粗/越糊"）
 * - **几何**跟着缩放：环半径、点半径、线的两端 —— 它们是"地图上的距离/对象大小"；
 * - **渲染属性**不跟：网格与轴标（屏幕空间绘制，1px 恒定 + 逐条对齐设备像素，见 `snap.ts`）、
 *   环/连线/悬停格/聚焦圈的线宽与虚线节奏（按 `1 / scale` 传给 painter）、各处的字号。
 *   线宽只表达"看不看得见"，不表达距离。
 *
 * ## 手感（这是本组件最重要的一条工程约束）
 * 拖动/缩放期间**不提交任何 React 渲染**：位姿在 `poseRef` 里，手势直接改它并命令式重画
 * （上一轮的 `GraphCanvas` 每帧一次提交，实测 60 帧 = 60 次；改成命令式后是 0 次）。
 * 位姿只在**手势结束**时通过 `onPose` 汇报给 React（读数用）。
 *
 * ## 契约
 * - **受控绘制**：高亮格 `value`、悬停点 `hoverKey`、选中点 `selectedKey` 全部由外部决定，
 *   组件自己不存这些 UI 状态（只有"光标在哪"这种纯内部的瞬时值用 state）；
 * - **几何非法 ⇒ 什么都不画**，并把 `usable: false` 报出去，绝不产生 NaN；
 * - **滚轮只在真的能缩放时才被消费**：到上下限就把滚轮还给页面（否则画布变成"滚轮黑洞"）；
 * - `getContext` 返回 null（jsdom / 极端环境）⇒ 静默降级，不抛错；
 * - `touchAction: 'none'` 先在（捏合缩放要用，PC 端无副作用）。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { theme } from 'antd';
import { canvasSize, cellLabel, fitCellPx, GRID_PAD_PX, gridCenter, lineCount } from './geometry.js';
import type { GridLayout } from './geometry.js';
import { gridPalette } from './palette.js';
import { paintScene } from './paint-scene.js';
import { FIT_POSE } from './pose.js';
import type { Pose } from './pose.js';
import type { CanvasGridProps, GridLink, GridMark, GridMetrics, GridPoint, GridRing } from './types.js';
import { useElementSize, readDevicePixelRatio } from './use-element-size.js';
import { useGridPointers } from './use-grid-pointers.js';
import { useViewPose } from './use-view-pose.js';

export type { GridCell, GridLayout, GridRect } from './geometry.js';
export type { CanvasGridProps, GridLink, GridMark, GridMetrics, GridRing } from './types.js';
// 世界口径（原点 = 中心、y 向上、单位 = 格）与视图位姿（缩放 + 平移）：业务侧读数要用
export * from './world.js';
export * from './pose.js';

/** 主线间隔（格）：每 5 格一条深色线（+ 两端），于是「第几条主线 = 刻度值」。 */
const MAJOR_STEP = 5;
/** 模块级空数组：默认值共用同一个引用，避免每次渲染都造新数组把绘制 effect 打醒。 */
const NO_RINGS: readonly GridRing[] = [];
const NO_MARKS: readonly GridMark[] = [];
const NO_LINKS: readonly GridLink[] = [];

export function CanvasGrid(props: CanvasGridProps) {
  const {
    rows,
    cols,
    value = null,
    onHoverCell,
    onMetrics,
    onPose,
    resetToken = 0,
    minCellPx,
    majorStep = MAJOR_STEP,
    showCursorLabel = true,
    label = '网格画布',
    rings = NO_RINGS,
    marks = NO_MARKS,
    links = NO_LINKS,
    selectedKey = null,
    hoverKey = null,
    onHoverMark,
    onMarkClick,
    markHitSlopPx,
  } = props;

  const { token } = theme.useToken();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = useElementSize(rootRef);
  const [cursor, setCursor] = useState<GridPoint | null>(null);

  // 整图适配：格子取整数 ⇒ `scale = 1` 就是"清晰、刚好铺满"的今天这张网格
  const cellPx = fitCellPx({ availW: size.w, availH: size.h, rows, cols, pad: GRID_PAD_PX, minCellPx });
  const layout = useMemo<GridLayout>(() => ({ rows, cols, cellPx, pad: GRID_PAD_PX }), [rows, cols, cellPx]);
  const content = useMemo(() => canvasSize(layout), [layout]);
  const viewport = useMemo(() => ({ w: size.w, h: size.h }), [size.w, size.h]);
  const palette = useMemo(() => gridPalette(token), [token]);
  const dpr = readDevicePixelRatio();
  const poseRef = useRef<Pose>(FIT_POSE);

  /** 一帧的全部绘制。**命令式**：手势里每帧调它，不经过 React。 */
  const paint = useCallback((): void => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    paintScene(canvas, ctx, {
      layout,
      viewW: viewport.w,
      viewH: viewport.h,
      dpr,
      pose: poseRef.current,
      hover: value,
      cursor,
      majorStep,
      showCursorLabel,
      fontFamily: token.fontFamily,
      // 反色：亮暗主题自动都对（不需要为暗色另写一份配色）
      cursorLabelBackground: token.colorText,
      cursorLabelForeground: token.colorBgContainer,
      rings,
      marks,
      links,
      hoverMarkKey: hoverKey,
      selectedMarkKey: selectedKey,
      palette,
    });
  }, [
    layout,
    viewport,
    dpr,
    value,
    cursor,
    majorStep,
    showCursorLabel,
    rings,
    marks,
    links,
    hoverKey,
    selectedKey,
    palette,
    token.fontFamily,
    token.colorText,
    token.colorBgContainer,
  ]);

  const pose = useViewPose({ canvasRef, poseRef, viewport, content, repaint: paint, onPose });

  // React 驱动的重画：任何 props/state 变化都重画一帧（手势驱动的重画由上面那个 hook 负责）
  useLayoutEffect(() => {
    paint();
  }, [paint]);

  // 复位：位姿不在 React state 里，所以用"令牌"这种命令式逃生口触发（复位是低频操作）
  useEffect(() => {
    if (resetToken > 0) pose.reset();
  }, [resetToken, pose]);

  const metricsRef = useRef(onMetrics);
  useEffect(() => {
    metricsRef.current = onMetrics;
  }, [onMetrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // 中心点口径只写在 `gridCenter` 一处（内容是内容坐标；屏幕位置见 `onPose` 汇报的位姿）
    const center = gridCenter(layout);
    metricsRef.current?.({
      cellPx,
      width: viewport.w,
      height: viewport.h,
      bitmapWidth: canvas?.width ?? 0,
      bitmapHeight: canvas?.height ?? 0,
      dpr,
      axisLineCount: lineCount(cols),
      centerX: center?.x ?? 0,
      centerY: center?.y ?? 0,
      usable: cellPx > 0,
    });
  }, [layout, viewport, cols, cellPx, dpr]);

  const pointers = useGridPointers({
    canvasRef,
    layout,
    marks,
    poseRef,
    ...(markHitSlopPx === undefined ? {} : { markHitSlopPx }),
    ...(onHoverCell === undefined ? {} : { onHoverCell }),
    ...(onHoverMark === undefined ? {} : { onHoverMark }),
    ...(onMarkClick === undefined ? {} : { onMarkClick }),
    onCursor: setCursor,
    onDragStart: pose.onDragStart,
    onDragMove: pose.onDragMove,
    onDragEnd: pose.onDragEnd,
  });

  return (
    <div
      ref={rootRef}
      data-testid="canvas-grid-root"
      data-cell-px={cellPx}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="canvas-grid"
        data-hover={value === null ? '' : cellLabel(value)}
        data-canvas-w={viewport.w}
        data-canvas-h={viewport.h}
        role="img"
        aria-label={`${label}：${rows} × ${cols} 格（可滚轮缩放、拖动平移）`}
        onPointerMove={pointers.onPointerMove}
        onPointerLeave={pointers.onPointerLeave}
        onPointerDown={pointers.onPointerDown}
        onPointerUp={pointers.onPointerUp}
        style={{
          display: 'block',
          width: viewport.w,
          height: viewport.h,
          cursor: 'grab',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
