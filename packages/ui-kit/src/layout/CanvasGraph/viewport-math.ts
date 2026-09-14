/**
 * `CanvasGraph` 的**视口数学**（纯函数，不碰 React / DOM，单独成文件便于单测）。
 *
 * 「目标位姿 `target` + 当前位姿 `current`」两段式：
 * - 滚轮 / 捏合改的是 **target**（且按锚点补偿 pan，锚点下的东西不动）；
 * - 每帧把 **current 向 target 逼近**（`ZOOM_LERP`）—— 这就是旧实现缺的**平滑缩放**；
 * - 拖动改的是**两者**的 pan（跟手必须 1:1，不能有插值延迟）；
 * - 松手后 target 不再变，current 会自己收敛过去（惯性同理，见 `decaySpeed`）。
 *
 * 所有函数都是防御式的：非有限数一律收敛到安全值，**绝不产出 NaN**
 * （NaN 会让整块画布静默消失）。几何常量与夹取规则**复用 `GraphCanvas/geometry`**
 * —— 两条渲染路线必须共用同一套坐标口径（§14.1/§14.3），否则换路线就换坐标。
 */
import { clampPan, clampZoom, finite, fitZoom, zoomAt } from '../GraphCanvas/geometry.js';
import type { CanvasGraphPose } from './types.js';

/** 一格滚轮对应的缩放倍率（平滑由逐帧逼近承担，所以步进不用小）。 */
export const WHEEL_ZOOM_STEP = 1.12;
/** 触控板捏合（浏览器会合成成 `ctrl+wheel`）的步进：比鼠标滚轮更细。 */
export const PINCH_WHEEL_ZOOM_STEP = 1.04;
/** 两指距离小于它就视为无效（防除零 / 抖动）。 */
export const PINCH_MIN_DISTANCE_PX = 8;
/** 每帧朝目标 zoom 逼近的比例：0.3 ≈ 4~5 帧收敛，既有「跟手」又有「顺滑」。 */
export const ZOOM_LERP = 0.3;
/** 惯性每帧保留的速度比例（60fps 下 ≈ 0.4s 滑停）。 */
export const INERTIA_FRICTION = 0.9;
/** 惯性停止阈值（px/ms）。 */
export const INERTIA_MIN_SPEED = 0.02;
/** 惯性速度上限（px/ms）：甩一下不该把图甩没。 */
export const INERTIA_MAX_SPEED = 2.5;
/** 位姿收敛判定阈值。 */
const POSE_EPSILON = 0.0005;

/** 夹取所需的全部边界。 */
export interface PoseBounds {
  worldW: number;
  worldH: number;
  viewW: number;
  viewH: number;
  minZoom: number;
  maxZoom: number;
}

/** 整图适配并居中（打开时的默认视图）。 */
export function fitPose(worldW: number, worldH: number, viewW: number, viewH: number): CanvasGraphPose {
  const zoom = fitZoom(worldW, worldH, viewW, viewH);
  return {
    zoom,
    panX: (finite(viewW, 0) - finite(worldW, 0) * zoom) / 2,
    panY: (finite(viewH, 0) - finite(worldH, 0) * zoom) / 2,
  };
}

/** 夹取到合法范围：zoom 落在 `[minZoom, maxZoom]`，pan 保证至少露出图的一角。 */
export function clampPose(pose: CanvasGraphPose, bounds: PoseBounds): CanvasGraphPose {
  const zoom = clampZoom(pose.zoom, bounds.minZoom, bounds.maxZoom);
  return {
    zoom,
    panX: clampPan(pose.panX, bounds.worldW, zoom),
    panY: clampPan(pose.panY, bounds.worldH, zoom),
  };
}

/**
 * 以屏幕点 `(anchorX, anchorY)` 为锚点把 zoom 改到 `nextZoom`，锚点下的世界坐标保持不动。
 * 触控板捏合 / 滚轮缩放都用它（旧实现已用同一公式，这里只是补上夹取）。
 */
export function zoomAtPoint(
  pose: CanvasGraphPose,
  anchorX: number,
  anchorY: number,
  nextZoom: number,
  bounds: PoseBounds,
): CanvasGraphPose {
  const zoom = clampZoom(nextZoom, bounds.minZoom, bounds.maxZoom);
  if (!(pose.zoom > 0) || zoom === pose.zoom) return { ...pose, zoom };
  return clampPose(
    {
      zoom,
      panX: zoomAt(pose.panX, anchorX, pose.zoom, zoom),
      panY: zoomAt(pose.panY, anchorY, pose.zoom, zoom),
    },
    bounds,
  );
}

/** 滚轮增量 → 缩放倍率。`deltaY < 0`（向上滚）= 放大。 */
export function zoomFactorFromWheel(deltaY: number, ctrlKey: boolean): number {
  const step = ctrlKey ? PINCH_WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
  return finite(deltaY, 0) < 0 ? step : 1 / step;
}

/** 两指距离 → 相对缩放倍率；任一侧非法 / 过近则回 1（不缩放）。 */
export function pinchScale(prevDistance: number, nextDistance: number): number {
  const prev = finite(prevDistance, 0);
  const next = finite(nextDistance, 0);
  if (prev < PINCH_MIN_DISTANCE_PX || next < PINCH_MIN_DISTANCE_PX) return 1;
  return next / prev;
}

/** 每帧逼近：zoom 与 pan 一起插值（`ratio` 已夹到 `(0, 1]`）。 */
export function lerpPose(current: CanvasGraphPose, target: CanvasGraphPose, ratio: number): CanvasGraphPose {
  const t = Math.min(1, Math.max(0, finite(ratio, ZOOM_LERP)));
  return {
    zoom: current.zoom + (target.zoom - current.zoom) * t,
    panX: current.panX + (target.panX - current.panX) * t,
    panY: current.panY + (target.panY - current.panY) * t,
  };
}

/** 当前位姿是否已收敛到目标（据此决定要不要继续跑 rAF）。 */
export function poseSettled(current: CanvasGraphPose, target: CanvasGraphPose): boolean {
  return (
    Math.abs(current.zoom - target.zoom) < POSE_EPSILON * Math.max(1, target.zoom) &&
    Math.abs(current.panX - target.panX) < POSE_EPSILON &&
    Math.abs(current.panY - target.panY) < POSE_EPSILON
  );
}

/** 惯性衰减一帧：速度 → 下一帧速度（夹取上限，低于阈值归零）。 */
export function decaySpeed(speed: number): number {
  const s = Math.min(INERTIA_MAX_SPEED, Math.max(-INERTIA_MAX_SPEED, finite(speed, 0)));
  const next = s * INERTIA_FRICTION;
  return Math.abs(next) < INERTIA_MIN_SPEED ? 0 : next;
}
