/**
 * `CanvasGraph` 的**视口 hooks 聚合出口**（React 侧唯一入口），无渲染。
 *
 * 分层（每层一个文件，各自可独立测）：
 * ```
 * viewport-math.ts     纯公式：适配 / 夹取 / 锚点缩放 / 插值 / 惯性衰减
 * pose-store.ts        可变位姿状态机（含每帧推进，可脱离 React 单测）
 * use-element-size.ts  容器尺寸观测（ResizeObserver）
 * use-viewport-pose.ts rAF 排帧 + 滚轮监听 + 提交时机
 * pointer-gestures.ts  抬手判定 / 双指几何（纯函数）
 * pointer-machine.ts   指针序列状态机（可脱离 React 单测）
 * ← 本文件             把「指针事件」翻译成机器输入，并对外给出视口 API
 * ```
 *
 * 两条**必须支持**的缩放路径（用户 2026-09-15 明确要求）：
 * 1. **鼠标滚轮**：画布内普通滚轮即缩放（以光标为锚点），`Ctrl/⌘+滚轮`（触控板捏合的浏览器
 *    合成事件）用更细的步进 —— 实现在 `use-viewport-pose.ts` 的非 passive 监听里；
 * 2. **触屏捏合**：两指距离驱动缩放、两指中心驱动平移 —— 实现在 `pointer-machine.ts`。
 *    它生效的前提是容器 `touch-action: none`（在 `index.tsx`），否则浏览器会先抢走手势。
 */
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPointerMachine } from './pointer-machine.js';
import type { PointerMachine } from './pointer-machine.js';
import { useViewportPose } from './use-viewport-pose.js';
import type { CanvasGraphPickSource, CanvasGraphPose } from './types.js';

export interface CanvasViewportOptions {
  worldW: number;
  worldH: number;
  maxZoomFactor: number;
  onItemPick: (key: string, source: CanvasGraphPickSource) => void;
  onBackgroundClick?: () => void;
  /** **每帧**位姿回调（命令式：调用方据此重绘 canvas / 移动枢纽，不得 setState）。 */
  onPose: (pose: CanvasGraphPose) => void;
  /** 手势落定后回调（唯一允许外部 React 提交的时刻）。 */
  onPoseSettle?: (pose: CanvasGraphPose) => void;
}

export interface CanvasViewport {
  ref: React.MutableRefObject<HTMLDivElement | null>;
  /** 容器尺寸（CSS 像素）；canvas 位图尺寸与轴标绘制都要它。 */
  size: { w: number; h: number };
  /** 已落定位姿（渲染读数；手势中的真值在 store 里）。 */
  pose: CanvasGraphPose;
  /** **手势中的真值**（每帧都在变）；React 每次提交后重新定位枢纽要用它。 */
  livePose: () => CanvasGraphPose;
  /** 是否已越过拖动阈值（只用于切光标 `grab`/`grabbing`）。 */
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** 以视口中心为锚点按倍率缩放（内置控件用）。 */
  zoomBy: (factor: number) => void;
  /** 整图复位。 */
  reset: () => void;
  cancelDrag: () => void;
}

export function useCanvasViewport(options: CanvasViewportOptions): CanvasViewport {
  const { worldW, worldH, maxZoomFactor } = options;
  const poseApi = useViewportPose({
    worldW,
    worldH,
    maxZoomFactor,
    onPose: options.onPose,
    onSettle: (pose) => options.onPoseSettle?.(pose),
  });
  const [dragging, setDragging] = useState(false);
  const live = useRef(options);
  live.current = options;
  const api = useRef(poseApi);
  api.current = poseApi;

  const machine = useRef<PointerMachine | null>(null);
  if (machine.current === null) {
    machine.current = createPointerMachine({
      // 全部经 ref 现取：机器只创建一次，绝不能抓到首帧的旧闭包
      api: () => api.current,
      rect: () => api.current.ref.current?.getBoundingClientRect() ?? null,
      pick: (key, source) => live.current.onItemPick(key, source),
      background: () => live.current.onBackgroundClick?.(),
      dragging: setDragging,
    });
  }
  const gestures = machine.current;

  /** 命中枢纽靠 DOM 属性查（`data-canvas-item`），因此这一步留在 React 侧。 */
  const itemKeyOf = (event: ReactPointerEvent<HTMLDivElement>): string | null => {
    const hit = (event.target as HTMLElement).closest('[data-canvas-item]');
    return hit instanceof HTMLElement ? hit.getAttribute('data-canvas-item') : null;
  };

  return {
    ref: poseApi.ref,
    size: poseApi.size,
    pose: poseApi.pose,
    livePose: () => poseApi.livePose(),
    dragging,
    onPointerDown: (event) => {
      // **第一行必须 preventDefault**：否则鼠标拖动会变成原生文本选择（拖动抑制，`19 §2`）
      event.preventDefault();
      try {
        // 指针捕获是「拖出画布也不丢事件」的兜底；环境不支持时不阻断交互（jsdom 会抛）
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // 忽略：无指针捕获能力
      }
      gestures.down({
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        itemKey: itemKeyOf(event),
      });
    },
    onPointerMove: (event) => {
      gestures.move({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
    },
    onPointerUp: (event) => {
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // 同 setPointerCapture
      }
      gestures.up({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
    },
    zoomBy: (factor) => poseApi.zoomTo(factor, poseApi.size.w / 2, poseApi.size.h / 2),
    reset: () => poseApi.reset(),
    cancelDrag: () => gestures.cancel(),
  };
}
