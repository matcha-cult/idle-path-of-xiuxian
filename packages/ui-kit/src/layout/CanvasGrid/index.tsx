/**
 * `CanvasGrid` —— **画布上的等宽格子网格**（地图重做的第一块地基）。
 *
 * ## 这一步只解决一件事
 * 「纵横 42 个小格子画得出来，鼠标移到哪一格就报出哪一格」。刻意**不含**任何地图业务
 * （无节点、无连线、无对象、无缩放拖拽）：坐标系与绘制没验穿之前，往上叠的每一层都会
 * 把几何错误伪装成「手感问题」。
 *
 * ## 为什么是纯 canvas（用户 2026-09-15 定的方向）
 * 网格是「一堆没有身份的线」——不需要被单独点中，也就不需要是 DOM。代价是：
 * **画出来的东西在 DevTools 里没有 DOM，我（看不到浏览器）和你（看不到我画了什么）都失去了
 * 现场**。因此本组件把可读事实**主动交出去**：`onMetrics` 报几何与环境，页面把读数印在屏幕上。
 *
 * ## 层序（在 `paintScene` 里，有单测钉住）
 * 底色 → 细格线 → 主线 → 轴标 → 悬停格（交互反馈） → **中心圆（内容）** → 光标坐标标签。
 * 圆心在 `(cols/2, rows/2)` 那个**格线交点**上，直径 = **1 格**（口径见 `centerMarkRadius`）；
 * 内容压在交互反馈之上，是为了不让鼠标经过时把地图内容染色。
 *
 * ## 契约
 * - **受控绘制**：高亮格由 `value` 决定，组件自己不存「哪一格高亮」这类 UI 状态，
 *   只用一个 ref 记录「上次已上报的格子」用于 hover 去重（同格内不重复上报，移出报 null，
 *   且**只报变化**——父组件不接管 `onHoverCell` 时也不会被刷爆）；
 * - **几何非法 ⇒ 什么都不画**，并把 `usable: false` 报出去，绝不产生 NaN（NaN 会静默白屏）；
 * - **DPR 感知**：位图 = CSS 尺寸 × `devicePixelRatio`，绘制前 `setTransform` 回 CSS 坐标系；
 * - **1px 线走 0.5 偏移**（`crisp`）——纯 canvas 必须自己做的清晰化，否则线会发虚；
 * - `getContext` 返回 null（jsdom / 极端环境）⇒ 静默降级，不抛错；
 * - `touchAction: 'none'`：**现在没用，但必须先在**——后面加捏合缩放时，浏览器默认手势会把
 *   pinch 吃掉（上一轮踩过）。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { theme } from 'antd';
import { canvasSize, cellAtPoint, cellLabel, fitCellPx, GRID_PAD_PX, gridCenter, lineCount, sameCell } from './geometry.js';
import type { GridCell, GridLayout } from './geometry.js';
import { gridPalette } from './palette.js';
import { paintScene } from './paint-scene.js';
import type { CanvasGridProps, GridMetrics, GridPoint } from './types.js';
import { readDevicePixelRatio, useElementSize } from './use-element-size.js';

export type { GridCell, GridLayout, GridRect } from './geometry.js';
export type { CanvasGridProps, GridMetrics } from './types.js';

/** 主线间隔（格）：每 5 格一条深色线（+ 两端），于是「第几条主线 = 刻度值」。 */
const MAJOR_STEP = 5;

export function CanvasGrid(props: CanvasGridProps) {
  const {
    rows,
    cols,
    value = null,
    onHoverCell,
    onMetrics,
    minCellPx,
    majorStep = MAJOR_STEP,
    showCursorLabel = true,
    label = '网格画布',
  } = props;

  const { token } = theme.useToken();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = useElementSize(rootRef);
  const [cursor, setCursor] = useState<GridPoint | null>(null);
  /** 上一次**已上报**的格子（hover 去重；不能用 `value` 代替，见文件头契约）。 */
  const reportedRef = useRef<GridCell | null>(null);

  // 整图适配：格子取整数，几何变化才换对象（避免无关重渲染反复重画）
  const cellPx = fitCellPx({ availW: size.w, availH: size.h, rows, cols, pad: GRID_PAD_PX, minCellPx });
  const layout = useMemo<GridLayout>(() => ({ rows, cols, cellPx, pad: GRID_PAD_PX }), [rows, cols, cellPx]);
  const box = useMemo(() => canvasSize(layout), [layout]);
  const palette = useMemo(() => gridPalette(token), [token]);
  const dpr = readDevicePixelRatio();

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    paintScene(canvas, ctx, {
      layout,
      boxW: box.w,
      boxH: box.h,
      dpr,
      hover: value,
      cursor,
      majorStep,
      showCursorLabel,
      fontFamily: token.fontFamily,
      // 反色：亮暗主题自动都对（不需要为暗色另写一份配色）
      cursorLabelBackground: token.colorText,
      cursorLabelForeground: token.colorBgContainer,
      palette,
    });
  }, [box, layout, dpr, majorStep, palette, showCursorLabel, value, cursor, token.fontFamily, token.colorText, token.colorBgContainer]);

  const metricsRef = useRef(onMetrics);
  useEffect(() => {
    metricsRef.current = onMetrics;
  }, [onMetrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // 中心点口径只写在 `gridCenter` 一处：读数与真正画出来的圆心永远同源
    const center = gridCenter(layout);
    metricsRef.current?.({
      cellPx,
      width: box.w,
      height: box.h,
      bitmapWidth: canvas?.width ?? 0,
      bitmapHeight: canvas?.height ?? 0,
      dpr,
      axisLineCount: lineCount(cols),
      centerX: center?.x ?? 0,
      centerY: center?.y ?? 0,
      usable: cellPx > 0,
    });
  }, [layout, box, cols, cellPx, dpr]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // 光标每次移动都要更新（标签跟着光标走），但同一格内**不重复上报** => 上层状态才不会被刷爆
    setCursor((prev) => (prev !== null && prev.x === x && prev.y === y ? prev : { x, y }));
    const next = cellAtPoint(x, y, layout);
    if (sameCell(next, reportedRef.current)) return;
    reportedRef.current = next;
    onHoverCell?.(next);
  };

  const handlePointerLeave = (): void => {
    setCursor(null);
    if (reportedRef.current === null) return;
    reportedRef.current = null;
    onHoverCell?.(null);
  };

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
        data-canvas-w={box.w}
        data-canvas-h={box.h}
        role="img"
        aria-label={`${label}：${rows} × ${cols} 格`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          display: 'block',
          width: box.w,
          height: box.h,
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
