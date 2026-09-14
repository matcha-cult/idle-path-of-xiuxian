/**
 * `CanvasGraph` 的**指针序列状态机**（不依赖 React / DOM，可直接单测）。
 *
 * 为什么不写在 hook 里：指针序列（谁按下了、越过阈值没有、是不是第二指、抬手算什么）是
 * **纯状态判定**，包在 React 里就只能靠模拟真实事件来测；抽出来后可以直接喂
 * `{ pointerId, clientX, clientY, itemKey }` 断言「拖动 60 帧只调 onPose、抬手只 coast 一次」。
 * 依赖全部经 `PointerMachineHost` 注入，因此本文件不 import React，也不 import 任何 UI。
 */
import { DRAG_THRESHOLD_PX } from '../GraphCanvas/geometry.js';
import { pairGeometry, resolvePointerUp } from './pointer-gestures.js';
import type { PickMemory } from './pointer-gestures.js';
import type { ViewportPoseApi } from './use-viewport-pose.js';
import { pinchScale } from './viewport-math.js';
import type { CanvasGraphPickSource } from './types.js';

/** 双击空白放大的倍率。 */
const DOUBLE_CLICK_ZOOM_FACTOR = 2;

export interface PointerDownInput {
  pointerId: number;
  pointerType: string;
  button: number;
  clientX: number;
  clientY: number;
  /** 按下时命中的枢纽 key（由调用方查 DOM 得到；未命中为 null）。 */
  itemKey: string | null;
}

export interface PointerMoveInput {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export type PointerUpInput = PointerMoveInput;

export interface PointerMachineHost {
  /** 位姿 API（每次现取，避免闭包抓到旧对象）。 */
  api: () => ViewportPoseApi;
  /** 容器当前 rect（捏合锚点与双击放大需要 viewport 坐标；拿不到就跳过锚点缩放）。 */
  rect: () => DOMRect | null;
  /** 命中枢纽（`tap` 只选中 / `double` 快捷移动）。 */
  pick: (key: string, source: CanvasGraphPickSource) => void;
  /** 空白轻点。 */
  background: () => void;
  /** 拖动态变化（只用于切光标，每次手势最多两次回调）。 */
  dragging: (dragging: boolean) => void;
}

export interface PointerMachine {
  down: (input: PointerDownInput) => void;
  move: (input: PointerMoveInput) => void;
  up: (input: PointerUpInput) => void;
  cancel: () => void;
}

/** 一次单指序列（拖动判定 + 命中目标 + 速度采样）。 */
interface DragState {
  id: number;
  startX: number;
  startY: number;
  originPanX: number;
  originPanY: number;
  moved: boolean;
  targetKey: string | null;
  lastX: number;
  lastY: number;
  lastAt: number;
}

export function createPointerMachine(host: PointerMachineHost): PointerMachine {
  const pointers = new Map<number, { x: number; y: number }>();
  /** 最近一次移动的速度采样（px/ms）—— 松手时交给惯性。 */
  let sample = { x: 0, y: 0 };
  let drag: DragState | null = null;
  let pinch: { distance: number; centerX: number; centerY: number } | null = null;
  let memory: PickMemory = { key: '', at: 0, x: 0, y: 0 };

  const clearGesture = (): void => {
    drag = null;
    pinch = null;
    pointers.clear();
    sample = { x: 0, y: 0 };
    host.dragging(false);
  };

  const down = (input: PointerDownInput): void => {
    // 非主键（右键 / 中键）不参与画布手势
    if (input.pointerType === 'mouse' && input.button !== 0) return;
    pointers.set(input.pointerId, { x: input.clientX, y: input.clientY });
    // 新手势开始：停惯性 + 冻结上一段缩放动画（否则按住时图还在自己走）
    host.api().freeze();
    sample = { x: 0, y: 0 };
    if (pointers.size >= 2) {
      // 第二指按下 → 进入捏合；作废单指拖动（不能同时平移与捏合）
      if (drag !== null) drag.moved = true;
      pinch = pairGeometry([...pointers.values()]);
      host.dragging(false);
      return;
    }
    pinch = null;
    const origin = host.api().livePose();
    drag = {
      id: input.pointerId,
      startX: input.clientX,
      startY: input.clientY,
      originPanX: origin.panX,
      originPanY: origin.panY,
      moved: false,
      targetKey: input.itemKey,
      lastX: input.clientX,
      lastY: input.clientY,
      lastAt: Date.now(),
    };
    host.dragging(false);
  };

  const move = (input: PointerMoveInput): void => {
    if (pointers.has(input.pointerId)) {
      pointers.set(input.pointerId, { x: input.clientX, y: input.clientY });
    }
    if (pinch !== null && pointers.size >= 2) {
      const pair = pairGeometry([...pointers.values()]);
      if (pair === null) return;
      const rect = host.rect();
      const api = host.api();
      // 先按中心位移平移，再以**新中心**为锚点缩放（顺序反了锚点会漂）
      api.panBy(pair.centerX - pinch.centerX, pair.centerY - pinch.centerY);
      if (rect !== null) {
        api.zoomTo(
          pinchScale(pinch.distance, pair.distance),
          pair.centerX - rect.left,
          pair.centerY - rect.top,
        );
      }
      pinch = pair;
      return;
    }
    const state = drag;
    if (state === null || state.id !== input.pointerId) return;
    const dx = input.clientX - state.startX;
    const dy = input.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      state.moved = true;
      host.dragging(true);
    }
    if (!state.moved) return;
    const now = Date.now();
    const elapsed = Math.max(1, now - state.lastAt);
    sample = { x: (input.clientX - state.lastX) / elapsed, y: (input.clientY - state.lastY) / elapsed };
    state.lastX = input.clientX;
    state.lastY = input.clientY;
    state.lastAt = now;
    // 跟手：直接写位姿（零 rAF、零 React 提交）
    host.api().setDragPan(state.originPanX, state.originPanY, dx, dy);
  };

  const up = (input: PointerUpInput): void => {
    pointers.delete(input.pointerId);
    if (pinch !== null) {
      if (pointers.size < 2) pinch = null;
      host.dragging(false);
      return;
    }
    const state = drag;
    drag = null;
    host.dragging(false);
    if (state === null) return;
    const decided = resolvePointerUp({
      moved: state.moved,
      targetKey: state.targetKey,
      memory,
      now: Date.now(),
      x: input.clientX,
      y: input.clientY,
      zoomFactor: DOUBLE_CLICK_ZOOM_FACTOR,
    });
    memory = decided.memory;
    const outcome = decided.outcome;
    if (outcome.kind === 'coast') {
      host.api().coast(sample.x, sample.y);
      return;
    }
    if (outcome.kind === 'item') {
      host.pick(outcome.key, outcome.source);
      return;
    }
    if (outcome.kind === 'zoom') {
      const rect = host.rect();
      if (rect === null) return;
      host.api().zoomTo(outcome.factor, input.clientX - rect.left, input.clientY - rect.top);
      return;
    }
    host.background();
  };

  return { down, move, up, cancel: clearGesture };
}
