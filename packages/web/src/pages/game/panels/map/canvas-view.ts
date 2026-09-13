/**
 * 地图画布的**纯派生逻辑**（不 render，单独成文件便于单测）。
 *
 * 与 `presentation.ts` 的分工：那里是「节点 / 环层 / 门槛」的通用展示翻译，
 * 这里是**只属于画布**的部分（四态、坐标合法性、悬停文案）。拆开是因为 web 的
 * `hygiene.test.ts` 要求单文件 ≤200 行 —— 而不是把注释删掉凑数。
 *
 * 口径：
 * - 四态只靠**亮度 / 描边色 / 尺寸**区分，图上不写名字（§11.1 第 2 条）；
 * - 坐标是服务端给的 **0-based 交叉线索引**，前端不做任何布局计算（§14.1）；
 * - 坐标非法（缺列 / 越界 / 非整数）**绝不进画布**：`NaN` 定位会让整块画布静默消失。
 */
import type { MapNodeView } from '@idle-path/ionet-transport';
import { ringLabel } from './presentation.js';

/** 枢纽四态：`current` 当前所在 / `visited` 已到达 / `known` 已知未到达 / `unknown` 未发现（本轮不下发）。 */
export type NodeVisualState = 'current' | 'visited' | 'known' | 'unknown';

const STATE_LABELS: Record<NodeVisualState, string> = {
  current: '当前所在',
  visited: '已到达',
  known: '已知未到达',
  unknown: '未发现',
};

/** 节点 → 四态（`currentCode` 为 null 时没有节点是「当前」）。 */
export function nodeVisualState(node: MapNodeView, currentCode: string | null): NodeVisualState {
  if (currentCode !== null && node.code === currentCode) return 'current';
  if (node.progress.visited) return 'visited';
  return 'known';
}

/** 四态的中文名（图例与无障碍名称共用；协议值不上屏）。未知状态回退「未知」。 */
export function nodeStateLabel(state: NodeVisualState): string {
  if (state === 'current') return STATE_LABELS.current;
  if (state === 'visited') return STATE_LABELS.visited;
  if (state === 'known') return STATE_LABELS.known;
  return STATE_LABELS.unknown;
}

/**
 * 坐标空间是否可用：行列必须是**有限整数且 > 0**。缺列（老服务端 / 手改种子）时返回 false，
 * 容器据此降级到列表视图。
 */
export function isCanvasGridReady(gridRows: number, gridCols: number): boolean {
  return Number.isInteger(gridRows) && Number.isInteger(gridCols) && gridRows > 0 && gridCols > 0;
}

/** 坐标是否落在画布内（越界 = 枢纽画到画布外，玩家永远点不到）。 */
export function isNodeOnGrid(node: MapNodeView, gridRows: number, gridCols: number): boolean {
  if (!isCanvasGridReady(gridRows, gridCols)) return false;
  const { gridRow, gridCol } = node;
  return (
    Number.isInteger(gridRow) &&
    Number.isInteger(gridCol) &&
    gridRow >= 0 &&
    gridCol >= 0 &&
    gridRow <= gridRows &&
    gridCol <= gridCols
  );
}

/** 悬停提示：名字 + 环层 + 状态（名字**只在这里**出现，画布上不写，§11.2）。 */
export function pinTooltipText(node: MapNodeView, state: NodeVisualState): string {
  return `${node.name} · ${ringLabel(node.ring)} · ${nodeStateLabel(state)}`;
}

/**
 * 节点是否**可交互**（P2.0 v3 §5）：
 * - 与当前所在**相邻**（服务端按 `game_map_edges` 判定，`node.adjacent`）→ 可直接前往；
 * - 或**传送点已点亮**（`progress.waypointUnlocked`）→ 可传送至此。
 *
 * 两者都不满足 → 画布画成暗色并 `disabled`，点击不改变选中态。
 * ⚠️ **战力不参与**（v3 已删「前往」的战力限制，`threshold` 只作展示）。
 */
export function isNodeInteractive(node: MapNodeView): boolean {
  return node.adjacent || node.progress.waypointUnlocked;
}

/** 不可交互节点的悬停补充说明（`pinTooltipText` 之后的第二句）。 */
export const LOCKED_HINT = '不可直达：需先到相邻地点，或点亮传送点';

