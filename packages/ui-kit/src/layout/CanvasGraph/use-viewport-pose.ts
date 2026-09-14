/**
 * `CanvasGraph` 的**位姿引擎（React 侧接线）**：把 `pose-store` 的可变真值接到 React 生命周期。
 *
 * 分工（四件可独立推理的事，各自一个文件）：
 * - `viewport-math.ts`：纯公式（适配 / 夹取 / 锚点缩放 / 插值 / 惯性衰减）；
 * - `pose-store.ts`：可变位姿状态机（含每帧推进，**可脱离 React 单测**）；
 * - `use-element-size.ts`：容器尺寸观测；
 * - 本文件：rAF 排帧、滚轮监听、**唯一允许 React 提交的时刻**。
 *
 * 提交策略（「手势期间零 React 提交」的来源）：
 * - 拖动跟手 → 直接 `onPose`（命令式写 DOM / 重绘 canvas），**不 setState**；
 * - 滚轮 / 捏合 / 惯性 → 排帧，逐帧只 `onPose`；**收敛那一帧**才 `setPose` + `onSettle`。
 *
 * 滚轮**手动挂非 passive 监听**：React 17+ 把 `onWheel` 以 passive 注册在根容器上，
 * 在那里 `preventDefault()` 会失效（浏览器会把 ctrl+滚轮当成页面缩放）。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { fitZoom } from '../GraphCanvas/geometry.js';
import { createPoseStore } from './pose-store.js';
import { useCanvasWheel } from './use-canvas-wheel.js';
import { UNKNOWN_SIZE, useElementSize } from './use-element-size.js';
import type { PoseBounds } from './viewport-math.js';
import type { CanvasGraphPose } from './types.js';

export interface ViewportPoseOptions {
  worldW: number;
  worldH: number;
  maxZoomFactor: number;
  /** **每帧**位姿回调（命令式：调用方据此重绘 canvas / 移动枢纽，不得 setState）。 */
  onPose: (pose: CanvasGraphPose) => void;
  /** 落定后回调（唯一允许外部 React 提交的时刻）。 */
  onSettle: (pose: CanvasGraphPose) => void;
}

export interface ViewportPoseApi {
  ref: MutableRefObject<HTMLDivElement | null>;
  /** 容器尺寸（CSS 像素）。 */
  size: { w: number; h: number };
  /** 已落定位姿（渲染读数；手势中的真值在 store 里）。 */
  pose: CanvasGraphPose;
  /**
   * **手势中的真值**（每帧都在变）。拖动起点必须读它而不是 `pose` —— `pose` 只在落定后更新，
   * 动画在飞时会读到过期值，表现为「刚缩放完立刻拖动，图会跳一下」。
   */
  livePose: () => CanvasGraphPose;
  /** 冻结动画：新手势按下时调用（见 `pose-store.freeze`）。 */
  freeze: () => void;
  bounds: () => PoseBounds;
  /** 拖动跟手：以「按下时的 pan + 位移」定位。 */
  setDragPan: (originPanX: number, originPanY: number, dx: number, dy: number) => void;
  /** 以屏幕点为锚点按倍率缩放目标位姿（平滑由帧循环承担）。 */
  zoomTo: (factor: number, anchorX: number, anchorY: number) => void;
  /** 目标位姿整体平移（捏合中心位移）。 */
  panBy: (dx: number, dy: number) => void;
  /** 松手惯性：给定速度（px/ms）开始滑停。 */
  coast: (velocityX: number, velocityY: number) => void;
  /** 停掉惯性（重新按下 / 捏合开始）。 */
  stopCoast: () => void;
  /** 立即提交当前位姿给 React（手势结束但没有动画在跑时用）。 */
  commit: () => void;
  /** 整图复位。 */
  reset: () => void;
}

export function useViewportPose(options: ViewportPoseOptions): ViewportPoseApi {
  const { worldW, worldH, maxZoomFactor } = options;
  const ref = useRef<HTMLDivElement | null>(null);
  const store = useRef(createPoseStore());
  const size = useElementSize(ref);
  const [pose, setPose] = useState<CanvasGraphPose>({ zoom: 1, panX: 0, panY: 0 });
  const raf = useRef<number | null>(null);
  const live = useRef(options);
  live.current = options;

  const bounds = useCallback((): PoseBounds => {
    const minZoom = fitZoom(worldW, worldH, size.w, size.h);
    return { worldW, worldH, viewW: size.w, viewH: size.h, minZoom, maxZoom: minZoom * maxZoomFactor };
  }, [worldW, worldH, size.w, size.h, maxZoomFactor]);
  const boundsRef = useRef(bounds());
  boundsRef.current = bounds();

  /** 提交一次（唯一允许 React 提交的出口）。 */
  const commit = useCallback((): void => {
    const next = store.current.pose();
    setPose(next);
    live.current.onSettle(next);
  }, []);

  /** 推进一帧；未收敛继续排帧，收敛则提交并停。 */
  const frame = useCallback((): void => {
    raf.current = null;
    const step = store.current.step(boundsRef.current);
    live.current.onPose(step.pose);
    if (step.settled) {
      commit();
      return;
    }
    raf.current = requestAnimationFrame(frame);
  }, [commit]);

  const schedule = useCallback((): void => {
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  // 尺寸 / 世界变化 → 整图适配居中（拖动缩放期间两者都不变，不会被拉回）
  useLayoutEffect(() => {
    if (size.w <= 0 || size.h <= 0) return;
    const fitted = store.current.fit(boundsRef.current);
    live.current.onPose(fitted);
    setPose(fitted);
    live.current.onSettle(fitted);
  }, [size.w, size.h, worldW, worldH]);

  const zoomTo = useCallback(
    (factor: number, anchorX: number, anchorY: number): void => {
      store.current.zoomTo(boundsRef.current, factor, anchorX, anchorY);
      schedule();
    },
    [schedule],
  );

  // 滚轮 / 触控板捏合：画布内滚轮就是缩放；到上下界把滚轮交回页面（见 use-canvas-wheel.ts）
  useCanvasWheel({ ref, bounds: () => boundsRef.current, zoom: () => store.current.pose().zoom, zoomTo });

  const setDragPan = useCallback((originPanX: number, originPanY: number, dx: number, dy: number): void => {
    live.current.onPose(store.current.dragTo(boundsRef.current, originPanX, originPanY, dx, dy));
  }, []);

  const panBy = useCallback(
    (dx: number, dy: number): void => {
      store.current.panBy(boundsRef.current, dx, dy);
      schedule();
    },
    [schedule],
  );

  const reset = useCallback((): void => {
    live.current.onPose(store.current.fit(boundsRef.current));
    schedule();
  }, [schedule]);

  return {
    ref,
    size: size.w === 0 && size.h === 0 ? UNKNOWN_SIZE : size,
    pose,
    livePose: () => store.current.pose(),
    freeze: () => {
      // 取消在排的帧：否则它落地时会 commit 一次（新手势期间多一次 React 提交）
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      store.current.freeze();
    },
    bounds,
    setDragPan,
    zoomTo,
    panBy,
    coast: (velocityX, velocityY) => {
      store.current.coast(velocityX, velocityY);
      schedule();
    },
    stopCoast: () => store.current.stopCoast(),
    commit,
    reset,
  };
}
