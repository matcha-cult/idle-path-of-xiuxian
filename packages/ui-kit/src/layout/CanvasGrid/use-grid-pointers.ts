/**
 * `useGridPointers` —— 画布的**指针交互**：悬停（格 + 点）、点击（选中/取消）、拖动（平移）。
 *
 * ## 为什么命中测试统一在**内容空间**做
 * 位姿（缩放/平移）只在 `pose.ts` 里正向一次、反向一次。指针进来先 `toContent()` 逆变换，
 * 之后格/点的命中判定与**没有缩放时完全一样** —— 于是"缩放了之后点不准"这种 bug
 * 从结构上就不可能发生。
 *
 * ## 两个"像素"口径要分开
 * - **命中下限**（手感参数）是**屏幕**像素：缩放 4 倍时仍然只要求 8 屏幕像素内可点，
 *   所以换到内容空间要**除以 scale**；
 * - **光标位置**用**屏幕**坐标（标签在屏幕空间画，不随缩放变大）。
 *
 * ## 只报变化
 * 格与点的悬停都只在**真的换了**才上报（同一格/同一点内移动不重复上报），
 * 否则上层状态会被 pointermove 刷爆。
 */
import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import { cellAtPoint, gridCenter, sameCell } from './geometry.js';
import type { GridCell, GridLayout } from './geometry.js';
import { DEFAULT_MARK_HIT_SLOP_PX, hitTestMarks, isClickGesture, markKeyOf } from './hit-test.js';
import { toContent } from './pose.js';
import type { Point, Pose } from './pose.js';
import type { GridMark } from './types.js';

export interface GridPointerHandlers {
  onPointerMove: (event: { clientX: number; clientY: number }) => void;
  onPointerLeave: () => void;
  onPointerDown: (event: { clientX: number; clientY: number }) => void;
  onPointerUp: (event: { clientX: number; clientY: number }) => void;
}

export interface GridPointersInput {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  layout: GridLayout;
  marks: readonly GridMark[];
  poseRef: MutableRefObject<Pose>;
  markHitSlopPx?: number;
  onHoverCell?: (cell: GridCell | null) => void;
  onHoverMark?: (key: string | null) => void;
  onMarkClick?: (key: string | null) => void;
  /** 光标位置（**屏幕坐标**；移出 ⇒ null） */
  onCursor: (point: Point | null) => void;
  /** 拖动（平移）回调：交给位姿控制器 */
  onDragStart: (point: Point) => void;
  onDragMove: (point: Point) => void;
  onDragEnd: () => void;
}

export function useGridPointers(input: GridPointersInput): GridPointerHandlers {
  const liveRef = useRef(input);
  liveRef.current = input;
  const reportedCell = useRef<GridCell | null>(null);
  const reportedMark = useRef<string | null>(null);
  const pressed = useRef<Point | null>(null);

  const screenPoint = (event: { clientX: number; clientY: number }): Point | null => {
    const canvas = liveRef.current.canvasRef.current;
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /** 屏幕 → 内容（位姿的唯一逆变换） */
  const contentOf = (screen: Point): Point => toContent(screen.x, screen.y, liveRef.current.poseRef.current);

  /** 命中测试：这个屏幕点命中了哪个点（返回 key；没命中 ⇒ null）。 */
  const markKeyAt = (screen: Point): string | null => {
    const { layout, marks, markHitSlopPx } = liveRef.current;
    const center = gridCenter(layout);
    if (center === null) return null;
    const content = contentOf(screen);
    const scale = liveRef.current.poseRef.current.scale;
    const slopPx = (markHitSlopPx ?? DEFAULT_MARK_HIT_SLOP_PX) / (scale > 0 ? scale : 1);
    const index = hitTestMarks({
      x: content.x,
      y: content.y,
      marks,
      center,
      cellPx: layout.cellPx,
      slopPx,
    });
    if (index === null) return null;
    const mark = marks[index];
    return mark === undefined ? null : markKeyOf(mark, index);
  };

  const onPointerMove = (event: { clientX: number; clientY: number }): void => {
    const screen = screenPoint(event);
    if (screen === null) return;
    const { layout, onCursor, onHoverCell, onHoverMark } = liveRef.current;
    onCursor(screen);

    const content = contentOf(screen);
    const nextCell = cellAtPoint(content.x, content.y, layout);
    if (!sameCell(nextCell, reportedCell.current)) {
      reportedCell.current = nextCell;
      onHoverCell?.(nextCell);
    }

    const nextMark = markKeyAt(screen);
    if (nextMark !== reportedMark.current) {
      reportedMark.current = nextMark;
      onHoverMark?.(nextMark);
    }

    // 拖动（自己被阈值门控：没超过点击阈值时不会真的平移）
    liveRef.current.onDragMove(screen);
  };

  const onPointerLeave = (): void => {
    const { onCursor, onHoverCell, onHoverMark } = liveRef.current;
    onCursor(null);
    if (reportedCell.current !== null) {
      reportedCell.current = null;
      onHoverCell?.(null);
    }
    if (reportedMark.current !== null) {
      reportedMark.current = null;
      onHoverMark?.(null);
    }
  };

  const onPointerDown = (event: { clientX: number; clientY: number }): void => {
    const screen = screenPoint(event);
    if (screen === null) return;
    pressed.current = screen;
    liveRef.current.onDragStart(screen);
  };

  const onPointerUp = (event: { clientX: number; clientY: number }): void => {
    const screen = screenPoint(event);
    const down = pressed.current;
    pressed.current = null;
    liveRef.current.onDragEnd();
    // 位移超过阈值 ⇒ 是拖动（不是点击）：视图已经平移过了，就不该再选中/取消
    if (screen === null || !isClickGesture(down, screen)) return;
    liveRef.current.onMarkClick?.(markKeyAt(screen));
  };

  return { onPointerMove, onPointerLeave, onPointerDown, onPointerUp };
}
