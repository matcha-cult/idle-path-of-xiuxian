/**
 * `MapDetailPanel` —— 右栏详情（选中节点的动作面）。
 *
 * 规格来源：`14-地图画布方案探讨.md` §11.2 / §12.1。
 *
 * **移动（前往）只在这里发生**：画布上点击枢纽永远只是「选中」（`MapCanvas` 只调 `onSelect`），
 * 唯一的规范路径是本面板里的「前往此地」按钮（PC 另有双击快捷键）。这条契约的理由是
 * 「有代价的动作必须由明确的意图触发」—— 它同时解决了 PC 误点与移动端误触，见 §12.1。
 *
 * 本组件是纯展示 + 回调，不读 store、不发请求。
 */
import type { MapNodeView, MapObjectView } from '@idle-path/ionet-transport';
import { SectionCard } from '@idle-path/ui-kit';
import { MapNodeCard } from './MapNodeCard.js';
import { nodeStateLabel, nodeVisualState } from './canvas-view.js';

export interface MapDetailPanelProps {
  node: MapNodeView;
  playerPower: number;
  currentCode: string | null;
  /** 当前地图的**全部**对象（P2.0 §3）；本组件按宿主 `nodeCode` 过滤后交给节点卡。 */
  objects?: readonly MapObjectView[];
  onEnter: (code: string) => void;
  onWaypoint: (code: string) => void;
  onEnterRealm?: (zoneCode: string) => void;
}

export function MapDetailPanel(props: MapDetailPanelProps) {
  const { node, playerPower, currentCode, objects = [], onEnter, onWaypoint, onEnterRealm } = props;
  const state = nodeVisualState(node, currentCode);
  const nodeObjects = objects.filter((object) => object.nodeCode === node.code);
  return (
    <SectionCard
      title="地点详情"
      subtitle={`${nodeStateLabel(state)} · 难度参考 / 传送点 / 职能入口`}
    >
      <MapNodeCard
        node={node}
        playerPower={playerPower}
        current={state === 'current'}
        objects={nodeObjects}
        onEnter={onEnter}
        onWaypoint={onWaypoint}
        onEnterRealm={onEnterRealm}
      />
    </SectionCard>
  );
}
