/**
 * `useViewPose` —— 把「视图位姿」接到**真实的指针手势**上：滚轮缩放、拖动平移、松手惯性、复位。
 *
 * ## 为什么位姿不放 React state（这是手感的关键）
 * 拖动/缩放期间每帧都要重画。位姿若是 state，每帧就提交一次 React 渲染 —— 上一轮的
 * `GraphCanvas` 正是这么写的（实测 60 帧 = **60 次提交**），改成命令式之后是 **0 次**。
 * 所以这里：位姿放在 **ref** 里，手势直接改 ref 并调 `repaint()`（命令式重画），
 * 只在**手势结束**（滚轮则停下 300ms 后）把位姿**汇报**给 React（读数用）。
 *
 * ## 滚轮为什么必须自己 `addEventListener`
 * React 的 `onWheel` 在根节点上是 **passive** 的，`preventDefault()` 无效 ⇒ 画布内滚轮会连带
 * 把页面一起滚（这是"滚轮缩放"最容易踩的坑）。所以这里手动挂 `{ passive: false }`。
 *
 * ## 只吃"真的能变"的滚轮
 * 缩放到上下限后 `zoomAt` 会返回同样的 scale —— 此时**不 preventDefault**，把滚轮还给页面，
 * 否则画布会变成"滚轮黑洞"（页面再也滚不动）。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { CLICK_MOVE_SLOP_PX } from './hit-test.js';
import { FIT_POSE, WHEEL_ZOOM_BASE, clampPose, isFitPose, panBy, zoomAt } from './pose.js';
import type { Point, Pose, Size } from './pose.js';

/** 惯性：每帧衰减与停止阈值（速度单位 px/ms）。 */
export const INERTIA_DECAY = 0.9;
export const INERTIA_MIN_SPEED = 0.02;
/** 滚轮停下多久算"手势结束"（用于把位姿汇报给读数）。 */
export const WHEEL_SETTLE_MS = 300;

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

export interface ViewPoseInput {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  /**
   * 绘制用位姿（**由组件持有**）：手势期间直接改它 —— 这是"0 次 React 提交"的关键。
   * 从外面传进来是为了让"读位姿的绘制函数"能先于本 hook 定义（免去循环依赖）。
   */
  poseRef: MutableRefObject<Pose>;
  /** 视口（画布 CSS 尺寸） */
  viewport: Size;
  /** 内容（网格 + pad）尺寸 */
  content: Size;
  /** 命令式重画（读 `poseRef.current`）；**不触发 React 渲染** */
  repaint: () => void;
  /** 手势结束时汇报位姿（读数用；**不是每帧**） */
  onPose?: (pose: Pose) => void;
}

export interface ViewPoseApi {
  reset: () => void;
  onDragStart: (point: Point) => void;
  onDragMove: (point: Point) => void;
  onDragEnd: () => void;
}

interface DragState {
  start: Point;
  last: Point;
  moved: boolean;
  vx: number;
  vy: number;
  time: number;
}

export function useViewPose(input: ViewPoseInput): ViewPoseApi {
  const { poseRef } = input;
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 最新入参放 ref（回调身份变化不该让手势失效，也不该进依赖数组）
  const liveRef = useRef(input);
  liveRef.current = input;

  const apply = useCallback((next: Pose): void => {
    poseRef.current = next;
    liveRef.current.repaint();
  }, []);

  const report = useCallback((): void => {
    liveRef.current.onPose?.(poseRef.current);
  }, []);

  /** 滚轮是连续事件，没有明确的"结束"，所以延后一点再汇报（避免每滚一格就提交一次渲染）。 */
  const scheduleReport = useCallback((): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      report();
    }, WHEEL_SETTLE_MS);
  }, [report]);

  const stopInertia = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** 惯性：每帧按速度平移并衰减；撞到边界或速度太小就停，然后汇报一次。 */
  const startInertia = useCallback(
    (vx: number, vy: number): void => {
      let velocity = { x: vx, y: vy };
      let last = now();
      const step = (): void => {
        const time = now();
        const dt = Math.min(50, Math.max(1, time - last));
        last = time;
        const { content, viewport } = liveRef.current;
        const before = poseRef.current;
        const next = panBy(before, velocity.x * dt, velocity.y * dt, content, viewport);
        apply(next);
        velocity = { x: velocity.x * INERTIA_DECAY, y: velocity.y * INERTIA_DECAY };
        // 夹紧后位置没变 ⇒ 已经顶到边界：立刻停（否则会"阻尼空转"，看着像卡住）
        const stuck = next.offsetX === before.offsetX && next.offsetY === before.offsetY;
        if (stuck || Math.hypot(velocity.x, velocity.y) < INERTIA_MIN_SPEED) {
          rafRef.current = null;
          report();
          return;
        }
        rafRef.current = requestAnimationFrame(step);
      };
      stopInertia();
      rafRef.current = requestAnimationFrame(step);
    },
    [apply, report, stopInertia],
  );

  // 滚轮：必须非 passive，否则 preventDefault 无效（页面会跟着滚）
  useEffect(() => {
    const canvas = input.canvasRef.current;
    if (canvas === null) return;
    const onWheel = (event: WheelEvent): void => {
      const { content, viewport } = liveRef.current;
      if (viewport.w <= 0 || viewport.h <= 0 || content.w <= 0 || content.h <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const next = zoomAt(poseRef.current, WHEEL_ZOOM_BASE ** -event.deltaY, anchor, content, viewport);
      // 到缩放上下限了 ⇒ 不吃事件，把滚轮还给页面
      if (next.scale === poseRef.current.scale) return;
      event.preventDefault();
      stopInertia();
      apply(next);
      scheduleReport();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [apply, input.canvasRef, scheduleReport, stopInertia]);

  // 视口 / 内容尺寸变了：缩放过就只夹紧（不乱动用户视角），没缩放过就重新整图适配
  useEffect(() => {
    const next = isFitPose(poseRef.current) ? FIT_POSE : poseRef.current;
    apply(clampPose(next, input.content, input.viewport));
    report();
  }, [apply, input.content, input.viewport, report]);

  // 卸载：清 rAF 与定时器（不留悬挂回调）
  useEffect(
    () => () => {
      stopInertia();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [stopInertia],
  );

  const reset = useCallback((): void => {
    stopInertia();
    const { content, viewport } = liveRef.current;
    apply(clampPose(FIT_POSE, content, viewport));
    report();
  }, [apply, report, stopInertia]);

  const onDragStart = useCallback(
    (point: Point): void => {
      stopInertia();
      dragRef.current = { start: point, last: point, moved: false, vx: 0, vy: 0, time: now() };
    },
    [stopInertia],
  );

  const onDragMove = useCallback(
    (point: Point): void => {
      const drag = dragRef.current;
      if (drag === null) return;
      // 还不到点击阈值 ⇒ 先不算拖动（否则"手抖 1px"会顺带把视图挪一下）
      if (!drag.moved) {
        const far =
          Math.abs(point.x - drag.start.x) > CLICK_MOVE_SLOP_PX ||
          Math.abs(point.y - drag.start.y) > CLICK_MOVE_SLOP_PX;
        if (!far) return;
        drag.moved = true;
      }
      const { content, viewport } = liveRef.current;
      const dx = point.x - drag.last.x;
      const dy = point.y - drag.last.y;
      apply(panBy(poseRef.current, dx, dy, content, viewport));

      const time = now();
      const dt = Math.max(1, time - drag.time);
      drag.vx = dx / dt;
      drag.vy = dy / dt;
      drag.time = time;
      drag.last = point;
    },
    [apply],
  );

  const onDragEnd = useCallback((): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null || !drag.moved) return;
    if (Math.hypot(drag.vx, drag.vy) > INERTIA_MIN_SPEED) startInertia(drag.vx, drag.vy);
    else report();
  }, [report, startInertia]);

  /**
   * 返回值**必须引用稳定**：调用方会把它放进 `useEffect` 依赖里驱动复位
   * （`useEffect(() => { if (resetToken > 0) pose.reset(); }, [resetToken, pose])`）。
   * 如果这里每次渲染都返回新对象，那个 effect 就会每次渲染都跑一遍 —— 而 `reset()`
   * 会 `report()`（父组件 `setState`）⇒ **自激成无限渲染**。这个坑真实发生过。
   */
  return useMemo(
    () => ({ reset, onDragStart, onDragMove, onDragEnd }),
    [reset, onDragStart, onDragMove, onDragEnd],
  );
}
