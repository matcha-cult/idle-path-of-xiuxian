/**
 * `CanvasGraph` 的**指针手势纯逻辑**（抬手判定 + 双指几何），不依赖 React / DOM。
 *
 * 抽出来的理由有两个：ui-kit 的「单文件 ≤200 行」红线；以及**双击/轻点混在一起最难测**
 * —— 用一个纯函数把「这次抬手到底算什么」判成可枚举的结果，边界（恰好落在双击窗口上、
 * 位移恰好等于阈值、前后两次点的是不同枢纽）就能逐个断言，不用去模拟真实指针序列。
 */
import { DRAG_THRESHOLD_PX } from '../GraphCanvas/geometry.js';
import { DOUBLE_CLICK_MS } from '../GraphCanvas/use-graph-viewport.js';
import type { CanvasGraphPickSource } from './types.js';

/** 上一次轻点的记忆（用于双击判定；`key` 为空串表示「点的空白」）。 */
export interface PickMemory {
  key: string;
  at: number;
  x: number;
  y: number;
}

/** 一次抬手产生的意图。 */
export type PointerOutcome =
  /** 拖动过 → 交给惯性滑停。 */
  | { kind: 'coast' }
  /** 命中枢纽的单击（只选中）或双击（PC 快捷移动）。 */
  | { kind: 'item'; key: string; source: CanvasGraphPickSource }
  /** 双击空白：以该点为锚点放大。 */
  | { kind: 'zoom'; factor: number }
  /** 单击空白。 */
  | { kind: 'background' };

export interface PointerUpInput {
  /** 本次序列是否越过拖动阈值。 */
  moved: boolean;
  /** 按下时命中的枢纽 key（未命中为 null）。 */
  targetKey: string | null;
  memory: PickMemory;
  now: number;
  x: number;
  y: number;
  /** 双击空白时的缩放倍率。 */
  zoomFactor: number;
}

/**
 * 判定一次抬手。
 *
 * 口径（`14-...md` §12.1/§12.2）：
 * - 拖过 → 永远不算点击；
 * - 双击要**同时**满足三条：同一目标（同一枢纽或两次都是空白）、间隔 `≤ DOUBLE_CLICK_MS`、
 *   两次落点相距 `≤ DRAG_THRESHOLD_PX`。
 *   第三条对**枢纽**同样必要：枢纽的命中盒包含图形**与它下方的名字**，两者相距可超 40px ——
 *   只判「同一个枢纽」的话，「先点图标、再点名字」就会变成双击直达 ⇒ **意外移动**
 *   （正是 §12.1 要防的误触）。这条是 2026-09-15 由单测发现的真实缺陷。
 * - 拖动（coast）**不改记忆**：拖动之后的第一下轻点仍算「第一下」。
 */
export function resolvePointerUp(input: PointerUpInput): { outcome: PointerOutcome; memory: PickMemory } {
  const { moved, targetKey, memory, now, x, y, zoomFactor } = input;
  if (moved) return { outcome: { kind: 'coast' }, memory };
  const key = targetKey ?? '';
  const withinWindow = memory.key === key && now - memory.at <= DOUBLE_CLICK_MS;
  const sameSpot = Math.hypot(x - memory.x, y - memory.y) <= DRAG_THRESHOLD_PX;
  const doubleTap = withinWindow && sameSpot;
  const nextMemory: PickMemory = { key, at: now, x, y };
  if (targetKey !== null) {
    return { outcome: { kind: 'item', key: targetKey, source: doubleTap ? 'double' : 'tap' }, memory: nextMemory };
  }
  if (doubleTap) return { outcome: { kind: 'zoom', factor: zoomFactor }, memory: nextMemory };
  return { outcome: { kind: 'background' }, memory: nextMemory };
}

/**
 * 枢纽的**命中判定**：这次 pointerdown 到底算不算「点枢纽」。
 *
 * 关键一条（否则「在枢纽里放按钮」等于不能用）：指针落在枢纽**内部的可交互后代**上
 * （真按钮 / 链接 / 输入框 / 任何带 `tabindex` 或 `role=button` 的元素）时，**不算点枢纽** ——
 * 否则在按钮上**双击**会被判成枢纽的双击直达（＝把玩家传送走）。这类交互归那个元素自己。
 *
 * 判定顺序：先找枢纽祖先，再看指针起点是否被某个**非枢纽**的可交互元素接住。
 * 纯 DOM 查询、无坐标数学 —— 这正是混合渲染相对全 canvas 的核心好处：命中交给浏览器。
 */
const HUB_SELECTOR = '[data-canvas-item]';
const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, summary, [role="button"], [tabindex]';

export function resolveItemKey(target: Element | null): string | null {
  if (target === null) return null;
  const hub = target.closest(HUB_SELECTOR);
  if (hub === null) return null;
  const inner = target.closest(INTERACTIVE_SELECTOR);
  if (inner !== null && inner !== hub) return null;
  return hub.getAttribute('data-canvas-item');
}

/** 两指几何：距离（驱动缩放）+ 中心（驱动平移）。`points` 少于 2 个时返回 null。 */
export function pairGeometry(
  points: readonly { x: number; y: number }[],
): { distance: number; centerX: number; centerY: number } | null {
  const [a, b] = points;
  if (a === undefined || b === undefined) return null;
  return {
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    centerX: (a.x + b.x) / 2,
    centerY: (a.y + b.y) / 2,
  };
}
