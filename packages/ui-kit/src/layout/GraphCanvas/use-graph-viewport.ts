/**
 * `GraphCanvas` 的**视口状态与交互**（缩放 / 平移 / 拖动判定），无渲染。
 *
 * 单独成文件的理由有两个：`index.tsx` 要守住 ui-kit 的「单文件 ≤200 行」红线；
 * 且视口逻辑（`zoom_fit`、锚点缩放、拖动阈值）本身与 DOM 结构无关，值得独立可读。
 *
 * 交互口径（`14-地图画布方案探讨.md` §12.2 / §14.6）：
 * - 默认 `zoom_fit` 整图适配并居中；容器尺寸变化时重新适配；
 * - `Ctrl/⌘ + 滚轮` 以光标为锚点缩放，**普通滚轮直接放行**（不 `preventDefault`，页面照常滚动）；
 * - 拖动平移用 pointer 事件（鼠标 / 触摸同一套）；位移 **> 8px** 记为拖动，不再当作点击；
 * - `onPointerDown` **第一行 `preventDefault()`**：阻止原生文本选择 / 拖拽起步（B2/B3 根因）；
 *   拖动中 `dragging=true`，容器与枢纽据此把光标切成 `grabbing`。
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
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

/** 枢纽被点击的判定来源：`tap` 单击（只选中）/ `double` 双击（PC 快捷移动，§12.1）。 */
export type GraphCanvasPickSource = 'tap' | 'double';

/** 双击判定窗口（ms）：PC 双击直达的阈值。 */
export const DOUBLE_CLICK_MS = 350;

export interface GraphCanvasViewport {
  /** 容器 ref（交给最外层 div）。 */
  ref: MutableRefObject<HTMLDivElement | null>;
  zoom: number;
  pan: Point;
  /** 是否已越过 8px 阈值进入拖动（用于把光标切成 `grabbing`）。 */
  dragging: boolean;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  cancelDrag: () => void;
}

export interface ViewportOptions {
  worldW: number;
  worldH: number;
  /** 命中枢纽时的回调（key + 单击/双击来源）。 */
  onItemPick: (key: string, source: GraphCanvasPickSource) => void;
  /** 空白处点击。 */
  onBackgroundClick?: () => void;
}

export function useGraphViewport(options: ViewportOptions): GraphCanvasViewport {
  const { worldW, worldH, onItemPick, onBackgroundClick } = options;
  const ref = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState | null>(null);
  const lastPick = useRef<{ key: string; at: number }>({ key: '', at: 0 });
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
    // **第一行必须 preventDefault**（B2/B3 的根因，见 index.tsx 顶部注释）：
    // 不阻止 pointerdown 的默认行为，鼠标拖动就会变成浏览器**原生文本选择** ——
    // 选区会自动滚动最近的可滚动祖先（界面「飘到左边」），松手还会弹出
    // 「搜索选中文本」（Edge 的选词搜索 UI；它只是因为选区存在才出现，不是 Edge 特例）。
    // 容器没有 tabIndex、不需要聚焦，因此这里不影响键盘可达性。
    event.preventDefault();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = (event.target as HTMLElement).closest('[data-graph-item]');
    drag.current = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { ...pan },
      moved: false,
      target: target instanceof HTMLElement ? target.getAttribute('data-graph-item') : null,
    };
    setDragging(false);
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
    if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      state.moved = true;
      setDragging(true);
    }
    if (!state.moved) return;
    setPan({
      x: clampPan(state.origin.x + dx, worldW, zoom),
      y: clampPan(state.origin.y + dy, worldH, zoom),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // 同 setPointerCapture
    }
    if (state === null || state.moved) return;
    if (state.target !== null) {
      // 双击直达（仅 PC）：同一枢纽在 DOUBLE_CLICK_MS 内被点第二次 → source='double'
      const now = Date.now();
      const last = lastPick.current;
      const isDouble = last.key === state.target && now - last.at <= DOUBLE_CLICK_MS;
      lastPick.current = { key: state.target, at: now };
      pick.current.onItemPick(state.target, isDouble ? 'double' : 'tap');
      return;
    }
    pick.current.onBackgroundClick?.();
  };

  return {
    ref,
    zoom,
    pan,
    dragging,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancelDrag: () => {
      drag.current = null;
      setDragging(false);
    },
  };
}
