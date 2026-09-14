/**
 * `CanvasGraph` 的**一帧命令式绘制**（canvas 位图 + 枢纽位移），不依赖 React。
 *
 * 从 `CanvasGraph/index.tsx` 抽出来的理由：
 * 1. ui-kit 的「单文件 ≤200 行」红线；
 * 2. 「canvas 位图尺寸**只在容器/DPR 变化时才改**」是一条容易写错、错了就掉帧的行为
 *    （每帧给 `canvas.width` 赋值会重置上下文状态并清空位图），抽出来后可用假 canvas 直接断言。
 *
 * 本函数**不产生任何 React 提交** —— 它是「手势期间零 React 提交」的实现落点：
 * 每帧只做位图重绘与 DOM `transform` 写入。
 */
import { isRenderableItem, itemScreenPosition } from '../GraphCanvas/geometry.js';
import { paintScene } from './paint.js';
import type { SceneSegment } from './paint.js';
import type { CanvasPaintStyle } from './palette.js';
import type { CanvasGraphItem, CanvasGraphPose } from './types.js';

/** 位图密度上限：DPR 3 的 4K 屏上按 3 倍出图会白白吃掉显存与填充率。 */
export const MAX_DPR = 2;

/** 一帧所需的最新输入（每帧现取，避免闭包过期）。 */
export interface FrameScene {
  /** 容器尺寸（CSS 像素）。 */
  size: { w: number; h: number };
  segments: readonly SceneSegment[];
  style: CanvasPaintStyle;
  showGrid: boolean;
  rows: number;
  cols: number;
  cellPx: number;
  items: readonly CanvasGraphItem[];
}

/** 把枢纽移到屏幕坐标（由调用方写 DOM；本模块不碰元素引用）。 */
export type MovePin = (key: string, x: number, y: number) => void;

/**
 * 画一帧。
 *
 * - `canvas` 为 null / 拿不到 2D 上下文（jsdom、极老浏览器）时**跳过底图**，枢纽照常定位
 *   —— 宁可少一层连线，也不要整块画布消失；
 * - `movePin` 对每个坐标合法的枢纽调一次；坐标非法（`NaN`）的枢纽**直接跳过**（不产出 NaN 位移）。
 */
export function paintFrame(
  canvas: HTMLCanvasElement | null,
  scene: FrameScene,
  pose: CanvasGraphPose,
  movePin: MovePin,
): void {
  const { w, h } = scene.size;
  if (canvas !== null) {
    const dpr = Math.min(MAX_DPR, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    // 只在尺寸变化时赋值：改 width/height 会重置上下文并清空位图，不能每帧做
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintScene(ctx, {
        rows: scene.rows,
        cols: scene.cols,
        cellPx: scene.cellPx,
        zoom: pose.zoom,
        panX: pose.panX,
        panY: pose.panY,
        viewW: w,
        viewH: h,
        showGrid: scene.showGrid,
        segments: scene.segments,
        style: scene.style,
      });
    }
  }
  for (const item of scene.items) {
    if (!isRenderableItem(item.row, item.col)) continue;
    const at = itemScreenPosition(item.row, item.col, scene.cellPx, pose.zoom, pose.panX, pose.panY);
    movePin(item.key, at.x, at.y);
  }
}
