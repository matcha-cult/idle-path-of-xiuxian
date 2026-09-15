/**
 * `hit-test` —— **点的命中测试**（纯函数）：画布上的一个像素坐标，命中了哪个功能点？
 *
 * 为什么单独一层：命中有两个很容易做错的细节 ——
 * 1. **太小的点也要点得着**：点直径 = 1 格（实测 10~16px），半径只有 5~8px，
 *    直接用"点到圆心的距离 ≤ 点半径"会让点变得很难点中；所以取
 *    `max(点半径, 命中下限)` —— 下限是**手感参数**，不是几何参数。
 * 2. **必须有确定结果**：多个点都在范围内时取**最近的**；完全平手时取**下标小的**，
 *    于是同样的输入永远命中同一个点（否则会出现"有时候点得中、有时候点不中"的幽灵 bug）。
 *
 * 与 `worldToScreen` 共用同一套坐标变换（同一个 y 翻转），所以命中位置与画出来的位置
 * 不可能各算一套 —— 这也是为什么这里直接调它，而不是自己再写一遍。
 */
import type { GridMark } from './types.js';
import { worldToScreen } from './world.js';

/** 命中半径下限（CSS 像素）：比这更小的点也按这个半径判定命中。 */
export const DEFAULT_MARK_HIT_SLOP_PX = 8;

/** 点击判定：按下到抬起的位移不超过这个值才算"点击"（超过就是拖动，留给以后的手势）。 */
export const CLICK_MOVE_SLOP_PX = 4;

/** 点的稳定标识：数据给了 `key` 就用它，否则退回下标（两种都要能工作）。 */
export function markKeyOf(mark: GridMark, index: number): string {
  return mark.key ?? String(index);
}

export interface MarkHitInput {
  /** 画布内 CSS 像素坐标 */
  x: number;
  y: number;
  marks: readonly GridMark[];
  /** 世界原点在画布上的位置（即 `gridCenter(layout)`） */
  center: { x: number; y: number };
  cellPx: number;
  /** 命中半径下限；缺省 `DEFAULT_MARK_HIT_SLOP_PX` */
  slopPx?: number;
}

/**
 * @returns 命中点的**下标**（用于回查 key 与数据）；都不中 ⇒ `null`。
 * 坐标非数 / 无点 ⇒ `null`（不抛错）。
 */
export function hitTestMarks(input: MarkHitInput): number | null {
  const { x, y, marks, center, cellPx, slopPx = DEFAULT_MARK_HIT_SLOP_PX } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(cellPx) || cellPx <= 0) return null;

  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < marks.length; index += 1) {
    const mark = marks[index];
    if (mark === undefined) continue;
    const at = worldToScreen(mark.at, center, cellPx);
    const dx = x - at.x;
    const dy = y - at.y;
    const distance = Math.hypot(dx, dy);
    const hitRadius = Math.max(mark.radiusCells * cellPx, slopPx);
    // 严格小于 ⇒ 平手时保留**先出现的那个**（下标小的），结果确定
    if (distance <= hitRadius && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/** 按下 → 抬起是否算"点击"（位移没超过阈值）。用于把点击从以后的拖动里区分出来。 */
export function isClickGesture(
  down: { x: number; y: number } | null,
  up: { x: number; y: number },
  slopPx: number = CLICK_MOVE_SLOP_PX,
): boolean {
  if (down === null) return false;
  return Math.abs(up.x - down.x) <= slopPx && Math.abs(up.y - down.y) <= slopPx;
}
