/**
 * `CanvasGraph` 的**位姿真值**（不依赖 React 的可变状态机，可脱离组件单测）。
 *
 * 为什么单独成文件：
 * 1. ui-kit 的「单文件 ≤200 行」红线（`test/hygiene.test.ts`）；
 * 2. 「惯性 / 平滑逼近 / 夹取」是纯数学时序，用 React 包一层再测等于白测 ——
 *    这里可以**直接**按帧调用 `step()` 断言轨迹（测试见 `pose-store.test.ts`）。
 *
 * 两段式：`target` 是意图（滚轮/捏合/惯性推它），`current` 每帧向它逼近；
 * **拖动例外**：`dragTo` 同时写两者（跟手必须 1:1，不能有插值延迟），
 * 于是帧循环自然停摆（零 rAF、零 React 提交）。
 */
import {
  ZOOM_LERP,
  clampPose,
  decaySpeed,
  fitPose,
  lerpPose,
  poseSettled,
  zoomAtPoint,
} from './viewport-math.js';
import type { PoseBounds } from './viewport-math.js';
import type { CanvasGraphPose } from './types.js';

/** 惯性按 60fps 折算位移（速度单位 px/ms）。 */
const FRAME_MS = 1000 / 60;

export interface PoseStep {
  pose: CanvasGraphPose;
  /** 收敛（且无惯性）→ 调用方提交一次并停止排帧。 */
  settled: boolean;
}

export interface PoseStore {
  /** 当前（用于显示的）位姿。 */
  pose(): CanvasGraphPose;
  /** 目标位姿（测试与调试用）。 */
  aim(): CanvasGraphPose;
  /** 整图适配居中（打开 / 复位）。 */
  fit(bounds: PoseBounds): CanvasGraphPose;
  /** 拖动跟手：以「按下时的 pan + 位移」定位（current 与 target 一起写）。 */
  dragTo(bounds: PoseBounds, originPanX: number, originPanY: number, dx: number, dy: number): CanvasGraphPose;
  /** 以屏幕点为锚点按倍率缩放目标位姿（平滑由 `step` 承担）。 */
  zoomTo(bounds: PoseBounds, factor: number, anchorX: number, anchorY: number): void;
  /** 目标位姿整体平移（捏合中心位移）。 */
  panBy(bounds: PoseBounds, dx: number, dy: number): void;
  /** 松手惯性（速度 px/ms）。 */
  coast(velocityX: number, velocityY: number): void;
  /** 停掉惯性（重新按下 / 捏合开始）。 */
  stopCoast(): void;
  /**
   * 冻结动画：把 `target` 拉到 `current` 并清速度，返回冻结后的位姿。
   * 新手势按下时必须调用 —— 否则上一段缩放动画会继续改 target，和拖动互相打架
   * （表现为「按住时图还在自己走」）。
   */
  freeze(): CanvasGraphPose;
  /** 推进一帧：惯性 → 逼近。 */
  step(bounds: PoseBounds): PoseStep;
}

/** 创建一个位姿状态机（初值由调用方随后 `fit()` 给定）。 */
export function createPoseStore(): PoseStore {
  let current: CanvasGraphPose = { zoom: 1, panX: 0, panY: 0 };
  let target: CanvasGraphPose = { ...current };
  let velocity = { x: 0, y: 0 };

  const snap = (pose: CanvasGraphPose): CanvasGraphPose => {
    current = pose;
    target = pose;
    velocity = { x: 0, y: 0 };
    return current;
  };

  return {
    pose: () => current,
    aim: () => target,
    fit: (bounds) => snap(fitPose(bounds.worldW, bounds.worldH, bounds.viewW, bounds.viewH)),
    dragTo: (bounds, originPanX, originPanY, dx, dy) =>
      snap(clampPose({ zoom: current.zoom, panX: originPanX + dx, panY: originPanY + dy }, bounds)),
    zoomTo: (bounds, factor, anchorX, anchorY) => {
      target = zoomAtPoint(target, anchorX, anchorY, target.zoom * factor, bounds);
      velocity = { x: 0, y: 0 };
    },
    panBy: (bounds, dx, dy) => {
      target = clampPose({ zoom: target.zoom, panX: target.panX + dx, panY: target.panY + dy }, bounds);
    },
    coast: (velocityX, velocityY) => {
      velocity = { x: velocityX, y: velocityY };
    },
    stopCoast: () => {
      velocity = { x: 0, y: 0 };
    },
    freeze: () => {
      target = { ...current };
      velocity = { x: 0, y: 0 };
      return current;
    },
    step: (bounds) => {
      if (velocity.x !== 0 || velocity.y !== 0) {
        target = clampPose(
          {
            zoom: target.zoom,
            panX: target.panX + velocity.x * FRAME_MS,
            panY: target.panY + velocity.y * FRAME_MS,
          },
          bounds,
        );
        velocity = { x: decaySpeed(velocity.x), y: decaySpeed(velocity.y) };
      }
      current = lerpPose(current, target, ZOOM_LERP);
      if (poseSettled(current, target) && velocity.x === 0 && velocity.y === 0) {
        current = { ...target };
        return { pose: current, settled: true };
      }
      return { pose: current, settled: false };
    },
  };
}
