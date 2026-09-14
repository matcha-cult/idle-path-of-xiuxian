/**
 * `CanvasGraph` —— **canvas 混合渲染**的图原语（canvas 画网格/连线 + DOM 放枢纽）。
 *
 * 与 `GraphCanvas`（SVG + `transform: scale()` 的 div 世界层）是**同语义的兄弟实现**，
 * 调用方换组件即可换路线；坐标系与交互契约完全一致：
 * - 坐标是 **0-based 交叉线索引**（`14-...md` §14.1）；底图/连线跟随 zoom、**枢纽恒定屏幕尺寸**（§14.3）；
 * - **点击只选中**（§12.1）：`onSelect` 只在「命中枢纽 + 位移 ≤ 阈值」时触发。
 *
 * ## 三条必须支持的手势（用户 2026-09-15 明确要求）
 * | 手势 | 实现在哪 |
 * | --- | --- |
 * | **鼠标滚轮缩放** | `use-viewport-pose.ts` 的**非 passive** `wheel` 监听：画布内普通滚轮即缩放（以光标为锚点），`Ctrl/⌘+滚轮`（触控板捏合的合成事件）步进更细 |
 * | **触屏捏合缩放** | `pointer-machine.ts`：两指距离驱动缩放、两指中心驱动平移。前提是下面容器上的 `touchAction: 'none'`，否则浏览器先抢走手势 |
 * | **拖拽平移** | `pointer-machine.ts` 拖动分支 → `pose-store.dragTo`：位移越过 8px 阈值即跟手 1:1，松手按速度**惯性滑停** |
 *
 * ## 两条不能删的拖动抑制（`19-...md` §2，删任一都会回归）
 * 1. 容器 `userSelect: 'none'`（含 `WebkitUserSelect`）：没有它，鼠标拖动期间浏览器照样拉出选区，
 *    并自动滚动最近的可滚动祖先（界面「飘到左边」）、松手弹出「搜索选中文本」；
 * 2. 枢纽 `draggable={false}` + `onDragStart` preventDefault（在 `CanvasGraphPin`）。
 * 第 3 条「`onPointerDown` 里 preventDefault」在 `use-canvas-viewport` 的第一行。
 *
 * ## 性能
 * 手势期间**零 React 提交**：每帧只走 `paintFrame`（位图重绘 + 枢纽 `transform`），
 * React 只在「拖动开始/结束」与「手势落定」提交。
 *
 * ## 规模
 * 本组件只做接线；绘制帧在 `paint-frame.ts`、指针序列在 `pointer-machine.ts`、
 * 位姿在 `pose-store.ts`、枢纽在 `CanvasGraphPin`、控件在 `CanvasGraphControls`。
 *
 * 边界：`rows/cols ≤ 0`、`items=[]`、重复 key（后者胜）、非法 `cellPx`、无 2D 上下文（jsdom）
 * 一律收敛到安全值，绝不产出 `NaN` 坐标、绝不抛错。
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Typography, theme } from 'antd';
import { safeCellPx, worldSize } from '../GraphCanvas/geometry.js';
import { CanvasGraphControls } from '../CanvasGraphControls/index.js';
import { CanvasGraphPin } from '../CanvasGraphPin/index.js';
import { paintFrame } from './paint-frame.js';
import type { FrameScene } from './paint-frame.js';
import { paletteFromToken } from './palette.js';
import { resolveSegments } from './paint.js';
import { useCanvasViewport } from './use-canvas-viewport.js';
import type { CanvasGraphPose, CanvasGraphProps } from './types.js';

export type {
  CanvasGraphItem,
  CanvasGraphLink,
  CanvasGraphPickSource,
  CanvasGraphPose,
  CanvasGraphProps,
} from './types.js';

/** 内置控件的缩放步进。 */
const CONTROL_ZOOM_STEP = 1.25;

export function CanvasGraph(props: CanvasGraphProps) {
  const {
    rows,
    cols,
    items: rawItems,
    links = [],
    cellPx,
    showGrid = false,
    ariaLabel,
    onBackgroundClick,
    onPoseChange,
    maxZoomFactor = 4,
    showControls = true,
  } = props;
  const { token } = theme.useToken();
  const px = safeCellPx(cellPx);
  const worldW = worldSize(cols, px);
  const worldH = worldSize(rows, px);
  // 重复 key：**后者胜**（与 GraphCanvas 同口径），避免重复 key 警告与两个 DOM 节点
  const items = useMemo(() => [...new Map(rawItems.map((item) => [item.key, item])).values()], [rawItems]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinRefs = useRef(new Map<string, HTMLDivElement>());
  const [zoomPercent, setZoomPercent] = useState(100);
  /** 每帧绘制的**稳定入口**（视口只创建一次，不能抓到过期的绘制闭包）。 */
  const painter = useRef<(pose: CanvasGraphPose) => void>(() => {});

  const viewport = useCanvasViewport({
    worldW,
    worldH,
    maxZoomFactor,
    onItemPick: (key, source) => {
      const item = items.find((entry) => entry.key === key);
      if (item !== undefined && item.disabled !== true) item.onSelect?.(source);
    },
    onBackgroundClick,
    onPose: (pose) => painter.current(pose),
    onPoseSettle: (pose) => {
      setZoomPercent(Math.round(pose.zoom * 100));
      onPoseChange?.(pose);
    },
  });

  /** 每帧输入放 ref：绘制函数必须稳定（每帧都调），否则手势中途会换到旧闭包。 */
  const scene = useRef<FrameScene>({
    size: viewport.size,
    segments: [],
    style: paletteFromToken(token),
    showGrid,
    rows,
    cols,
    cellPx: px,
    items,
  });
  scene.current = {
    size: viewport.size,
    segments: resolveSegments(items, links, px),
    style: paletteFromToken(token),
    showGrid,
    rows,
    cols,
    cellPx: px,
    items,
  };

  const paint = useCallback((pose: CanvasGraphPose): void => {
    paintFrame(canvasRef.current, scene.current, pose, (key, x, y) => {
      const host = pinRefs.current.get(key);
      // transform 而非 left/top：不触发重排，17 个枢纽每帧也只花在合成上
      if (host !== undefined) host.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    });
  }, []);
  painter.current = paint;

  // 每次提交后按**手势真值**重新定位（用 livePose：动画在飞时 committed pose 是过期的）
  useLayoutEffect(() => {
    paint(viewport.livePose());
  });

  return (
    <div
      ref={viewport.ref}
      data-testid="canvas-graph"
      role="application"
      aria-label={ariaLabel ?? '图形画布'}
      onPointerDown={viewport.onPointerDown}
      onPointerMove={viewport.onPointerMove}
      onPointerUp={viewport.onPointerUp}
      onPointerCancel={viewport.cancelDrag}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // 触屏：不能用浏览器默认手势解析，否则捏合会变成页面缩放（捏合缩放的前提）
        touchAction: 'none',
        // 拖动抑制（勿删，见文件头）
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: viewport.dragging ? 'grabbing' : 'grab',
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="canvas-graph-surface"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {items.map((item) => (
        <CanvasGraphPin
          key={item.key}
          itemKey={item.key}
          row={item.row}
          col={item.col}
          content={item.content}
          title={item.title}
          selected={item.selected}
          disabled={item.disabled}
          dragging={viewport.dragging}
          onPick={() => item.onSelect?.('tap')}
          register={(host) => {
            if (host === null) pinRefs.current.delete(item.key);
            else pinRefs.current.set(item.key, host);
          }}
        />
      ))}
      <Typography.Text
        type="secondary"
        data-testid="canvas-graph-zoom"
        style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 11, pointerEvents: 'none' }}
      >
        {zoomPercent}%
      </Typography.Text>
      {showControls ? (
        <CanvasGraphControls
          onZoomIn={() => viewport.zoomBy(CONTROL_ZOOM_STEP)}
          onZoomOut={() => viewport.zoomBy(1 / CONTROL_ZOOM_STEP)}
          onReset={() => viewport.reset()}
        />
      ) : null}
    </div>
  );
}
