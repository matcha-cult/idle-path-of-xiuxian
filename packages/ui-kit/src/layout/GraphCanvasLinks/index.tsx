/**
 * `GraphCanvasLinks` —— 连线层（SVG，**跟随 zoom**）。
 *
 * 为什么不复用 `GraphCanvas` 目录：ui-kit 的 `hygiene.test.ts` 红线 6「每个组件目录必须有
 * 同目录测试」只覆盖 `<dir>/index.tsx`，同目录放第二个组件文件会绕过该门禁。因此连线层
 * 单独成一个组件目录，公开名用 `GraphCanvasLinks`（比内部名 `GraphLinks` 更像「公开原语」）。
 *
 * 约定：
 * - 坐标即**交叉线索引**（`14-地图画布方案探讨.md` §14.1）：`x = col * cellPx`（世界坐标）；
 * - 线是**细、低对比度、无箭头**的直线（§11.1 第 3 条）—— 长线能容忍的前提就是低视觉权重；
 * - `vectorEffect="non-scaling-stroke"`：父层 `scale(zoom)` 时线宽不跟着变成大粗线；
 * - 指向不存在 key 的连线**直接丢弃**（悬挂边不崩、不画到 (0,0)）。
 */
import { theme } from 'antd';
import type { GraphCanvasItem, GraphCanvasLink } from '../GraphCanvas/types.js';

export interface GraphCanvasLinksProps {
  items: readonly GraphCanvasItem[];
  links: readonly GraphCanvasLink[];
  /** 一格多少像素（世界坐标）。 */
  cellPx: number;
}

/** 各状态的线色 / 透明度（全部来自 antd token，禁 hex）。 */
function useLinkStyle(state: GraphCanvasLink['state']): { stroke: string; width: number; opacity: number } {
  const { token } = theme.useToken();
  if (state === 'active') {
    return { stroke: token.colorPrimary, width: 2.5, opacity: 0.9 };
  }
  if (state === 'locked') {
    return { stroke: token.colorTextQuaternary, width: 1.5, opacity: 0.35 };
  }
  return { stroke: token.colorTextTertiary, width: 1.5, opacity: 0.45 };
}

export function GraphCanvasLinks(props: GraphCanvasLinksProps) {
  const { items, links, cellPx } = props;
  const byKey = new Map(items.map((item) => [item.key, item]));

  return (
    <g data-testid="graph-canvas-links">
      {links.map((link, index) => {
        const from = byKey.get(link.from);
        const to = byKey.get(link.to);
        if (from === undefined || to === undefined) return null;
        return (
          <LinkLine
            key={`${link.from}->${link.to}#${index}`}
            x1={from.col * cellPx}
            y1={from.row * cellPx}
            x2={to.col * cellPx}
            y2={to.row * cellPx}
            state={link.state}
          />
        );
      })}
    </g>
  );
}

interface LinkLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state?: GraphCanvasLink['state'];
}

/** 单根线：状态 → 视觉。 */
function LinkLine(props: LinkLineProps) {
  const style = useLinkStyle(props.state);
  return (
    <line
      data-testid="graph-canvas-link"
      data-state={props.state ?? 'normal'}
      x1={props.x1}
      y1={props.y1}
      x2={props.x2}
      y2={props.y2}
      stroke={style.stroke}
      strokeWidth={style.width}
      opacity={style.opacity}
      vectorEffect="non-scaling-stroke"
    />
  );
}
