/**
 * `CanvasGraphPin` —— 图原语的**单个枢纽**（恒定屏幕尺寸，热区不随 zoom 变化）。
 *
 * 单独成目录的理由与 `GraphCanvasLinks` 相同：ui-kit 的门禁只要求 `<dir>/index.tsx` 有同目录测试，
 * 同目录再放第二个组件会绕过该门禁，因此第二个组件就该有自己的一等目录。
 *
 * 约定：
 * - **位置由父级命令式写 `transform`**（`paint-frame.ts`）：手势期间不能走 React 提交，
 *   所以这里的初始 `transform` 只是占位，首帧即被覆盖；
 * - 用 `transform` 而非 `left/top`：不触发重排；
 * - `draggable={false}` + `onDragStart` preventDefault：拖动抑制的第 2 条（`19-...md` §2），删了会回归
 *   「按住枢纽文字拖拽时把文字拖出去」；
 * - `data-canvas-item` 是**命中判定的唯一钩子**（`use-canvas-viewport` 靠 `closest` 查它）。
 */
import type { ReactNode } from 'react';
import { isRenderableItem } from '../GraphCanvas/geometry.js';

export interface CanvasGraphPinProps {
  /** 稳定 key（同时作为 `data-canvas-item` 的值）。 */
  itemKey: string;
  row: number;
  col: number;
  content: ReactNode;
  title?: string;
  selected?: boolean;
  disabled?: boolean;
  /** 是否正在拖动（切光标用）。 */
  dragging: boolean;
  /** 键盘触发（Enter / Space）等价于轻点。 */
  onPick: () => void;
  /** 注册 DOM 节点（父级据此写 transform）；卸载时以 null 反注册。 */
  register: (host: HTMLDivElement | null) => void;
}

export function CanvasGraphPin(props: CanvasGraphPinProps) {
  const { itemKey, row, col, content, title, selected, disabled = false, dragging, onPick, register } = props;
  // 坐标非有限 → 不渲染（不产出 NaN 位移，那会让枢纽飘到屏幕外且没有任何报错）
  if (!isRenderableItem(row, col)) return null;
  return (
    <div
      ref={register}
      data-canvas-item={itemKey}
      data-testid={`canvas-graph-item-${itemKey}`}
      data-selected={selected === true ? 'true' : undefined}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={title ?? itemKey}
      aria-disabled={disabled ? true : undefined}
      title={title}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        // 键盘触发等价于轻点（没有「双击直达」这种键盘语义）
        if (!disabled) onPick();
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: 'translate3d(0, 0, 0) translate(-50%, -50%)',
        willChange: 'transform',
        cursor: disabled ? 'not-allowed' : dragging ? 'grabbing' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {content}
    </div>
  );
}
