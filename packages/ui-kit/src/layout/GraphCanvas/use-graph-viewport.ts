/**
 * `GraphCanvas` 的**视口状态与交互**（缩放 / 平移 / 拖动判定），无渲染。
 *
 * 单独成文件的理由有两个：`index.tsx` 要守住 ui-kit 的「单文件 ≤200 行」红线；
 * 且视口逻辑（`zoom_fit`、锚点缩放、拖动阈值）本身与 DOM 结构无关，值得独立可读。
 *
 * 交互口径（`14-地图画布方案探讨.md` §12.2 / §14.6）：
 * - 默认 `zoom_fit` 整图适配并居中；容器尺寸变化时重新适配；
 * - `Ctrl/⌘ + 滚轮` 以光标为锚点缩放，**普通滚轮直接放行**（不 `preventDefault`，页面照常滚动）；
 * - 拖动平移用 pointer 事件（鼠标 / 触摸同一套）；位移 **> 8px** 记为拖动，不再当作点击。
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { DRAG_THRESHOLD_PX, MAX_ZOOM_FACTOR, clampPan, clampZoom, fitZoom, zoomAt } from './geometry.js';

export interface Point {
  x: number;
  y: number;
}

/** 一次 pointer 序列的状态（拖动判定 + 命中目标）。 */
interface DragState {
  id: number;
  start: Point;
  origin: Point;
  moved: boolean;
  target: string | null;
}

export interface GraphCanvasViewport {
  ref: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  pan: Point;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  cancelDrag: () => void;
}

export interface ViewportOptions {
  worldW: number;
  worldH: number;
  /** 命中枢纽时的回调（key）。 */
  onItemPick: (key: string) => void;
  /** 空白处点击。 */
  onBackgroundClick?: () => void;
}

export function useGraphViewport(options: ViewportOptions): GraphCanvasViewport {
  const { worldW, worldH, onItemPick, onBackgroundClick } = options;
  const ref = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const drag = useRef<DragState | null>(null);
  const pick = useRef(options);
  pick.current = options;

  const minZoom = fitZoom(worldW, worldH, view.x, view.y);
  const maxZoom = minZoom * MAX_ZOOM_FACTOR;

  useLayoutEffect(() => {
    const host = ref.current;
    if (host === null) return;
    const sync = (): void => {
      const rect = host.getBoundingClientRect();
      setView({ x: rect.width, y: rect.height });
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // 容器尺寸变化 → 重新整图适配并居中（拖动 / 缩放过程中尺寸不变，所以不会被拉回）
  useLayoutEffect(() => {
    if (view.x <= 0 || view.y <= 0) return;
    const fitted = fitZoom(worldW, worldH, view.x, view.y);
    setZoom(fitted);
    setPan({ x: (view.x - worldW * fitted) / 2, y: (view.y - worldH * fitted) / 2 });
  }, [view.x, view.y, worldW, worldH]);

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>): void => {
      // 普通滚轮**不劫持页面滚动**（§14.6）：只有 Ctrl/⌘ + 滚轮才缩放
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const host = ref.current;
      const next = clampZoom(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), minZoom, maxZoom);
      if (host === null || next === zoom) return;
      const rect = host.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;
      setPan((current) => ({
        x: clampPan(zoomAt(current.x, anchorX, zoom, next), worldW, next),
        y: clampPan(zoomAt(current.y, anchorY, zoom, next), worldH, next),
      }));
      setZoom(next);
    },
    [zoom, minZoom, maxZoom, worldW, worldH],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = (event.target as HTMLElement).closest('[data-graph-item]');
    drag.current = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { ...pan },
      moved: false,
      target: target instanceof HTMLElement ? target.getAttribute('data-graph-item') : null,
    };
    // 指针捕获是「拖出画布也不丢事件」的兜底；环境不支持时不阻断交互（jsdom 会抛）
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // 忽略：无指针捕获能力
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (state === null || state.id !== event.pointerId) return;
    const dx = event.clientX - state.start.x;
    const dy = event.clientY - state.start.y;
    if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) state.moved = true;
    if (!state.moved) return;
    setPan({
      x: clampPan(state.origin.x + dx, worldW, zoom),
      y: clampPan(state.origin.y + dy, worldH, zoom),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // 同 setPointerCapture
    }
    if (state === null || state.moved) return;
    if (state.target !== null) {
      pick.current.onItemPick(state.target);
      return;
    }
    pick.current.onBackgroundClick?.();
  };

  return {
    ref,
    zoom,
    pan,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancelDrag: () => {
      drag.current = null;
    },
  };
}
