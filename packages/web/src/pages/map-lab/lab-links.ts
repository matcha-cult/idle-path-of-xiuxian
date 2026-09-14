/**
 * `lab-links` —— 连线的**高亮判定**（纯函数）。
 *
 * 与旧 `MapCanvas` 里的 `linkState` 同口径（与选中/当前所在直接相连 → `active`）。
 * 之所以在新目录里再写一份而不是从 `MapCanvas` 导出：用户要求「**不能在存量临时方案中直接
 * 进行修改**」，因此旧文件一行不动；等新链路验收通过、旧入口退役时，这份实现直接搬回去即可。
 */
import type { MapEdgeView } from '@idle-path/ionet-transport';
import type { CanvasGraphLink } from '@idle-path/ui-kit';

/** 聚焦集合（选中 + 当前所在）为空 → 全部 `normal`；否则连到焦点的边为 `active`。 */
export function linkStateOf(
  edge: MapEdgeView,
  focus: readonly (string | null)[],
): CanvasGraphLink['state'] {
  const codes = focus.filter((code): code is string => code !== null);
  if (codes.length === 0) return 'normal';
  if (codes.includes(edge.fromNodeCode) || codes.includes(edge.toNodeCode)) return 'active';
  return 'normal';
}
