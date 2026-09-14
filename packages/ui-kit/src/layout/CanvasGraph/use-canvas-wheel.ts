/**
 * `CanvasGraph` 的**滚轮缩放监听**（单独成文件：ui-kit 单文件 ≤200 行红线；
 * 且「挂一个原生非 passive 监听 + 到边界就让行」是一段自成一体的逻辑，与 rAF 排帧无关）。
 *
 * 两条关键决定：
 * 1. **手动挂原生监听**：React 17+ 把 `onWheel` 以 **passive** 注册在根容器上，在那里
 *    `preventDefault()` 会失效（浏览器会把 `ctrl+滚轮` 当成页面缩放）；
 * 2. **到缩放上下界就把滚轮交回页面**：否则整块画布成为「滚轮黑洞」——鼠标停在画布上
 *    就永远滚不动页面（本轮的页面高度确实会超出视口，真机体感很差）。
 *    这是地图控件的常见做法；`deltaY === 0`（某些设备会发）既不缩放也不消费。
 *
 * `bounds` / `zoom` / `zoomTo` **必须经 ref 现取**：本 hook 的监听只在挂载时挂一次，
 * 直接闭包会捕获首帧的 `bounds`（那时容器尺寸还是 0，边界算错 → 会让行判断全错）。
 */
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { zoomFactorFromWheel } from './viewport-math.js';
import type { PoseBounds } from './viewport-math.js';

export interface CanvasWheelOptions {
  /** 画布容器（监听挂它身上）。 */
  ref: MutableRefObject<HTMLDivElement | null>;
  /** 当前边界（容器尺寸变了就变）。 */
  bounds: () => PoseBounds;
  /** **手势真值** zoom（不是已提交值）—— 边界判定必须用它。 */
  zoom: () => number;
  /** 以屏幕点为锚点按倍率缩放（调用方负责排帧）。 */
  zoomTo: (factor: number, anchorX: number, anchorY: number) => void;
}

/** 浮点比较容差：zoom 是连乘出来的，正好等于边界值不现实。 */
const EPSILON = 1e-6;

export function useCanvasWheel(options: CanvasWheelOptions): void {
  const live = useRef(options);
  live.current = options;

  useEffect(() => {
    const host = live.current.ref.current;
    if (host === null) return;
    const onWheel = (event: WheelEvent): void => {
      const { bounds, zoom, zoomTo } = live.current;
      const limit = bounds();
      const zoomingOut = event.deltaY > 0;
      const current = zoom();
      const atLower = zoomingOut && current <= limit.minZoom + EPSILON;
      const atUpper = !zoomingOut && current >= limit.maxZoom - EPSILON;
      if (event.deltaY === 0 || atLower || atUpper) return; // 交回页面滚动
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      zoomTo(
        zoomFactorFromWheel(event.deltaY, event.ctrlKey),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);
}
