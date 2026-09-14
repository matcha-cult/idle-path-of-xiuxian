/**
 * `MapDetailPanel` —— 右栏详情（选中节点的动作面）。
 *
 * 规格来源：`14-地图画布方案探讨.md` §11.2 / §12.1。
 *
 * **移动（前往）只在这里发生**：画布上点击枢纽永远只是「选中」（`MapCanvas` 只调 `onSelect`），
 * 唯一的规范路径是本面板里的「前往此地」按钮（PC 另有双击快捷键）。这条契约的理由是
 * 「有代价的动作必须由明确的意图触发」—— 它同时解决了 PC 误点与移动端误触，见 §12.1。
 *
 * **数据分层（T1）**：小标题按 `node.level === null` 分流 —— 职能型枢纽不出现「难度参考」
 * 字样（否则等于宣称宗门里天天杀同门），详见 `node-detail.ts`。
 *
 * 本组件是纯展示 + 回调，不读 store、不发请求。
 */
import type { ReactNode } from 'react';
import type { MapNodeView, MapObjectView } from '@idle-path/ionet-transport';
import { Flex } from 'antd';
import { SectionCard } from '@idle-path/ui-kit';
import { MapNodeCard } from './MapNodeCard.js';
import { detailSubtitleTail } from './node-detail.js';
import { nodeStateLabel, nodeVisualState } from './canvas-view.js';

export interface MapDetailPanelProps {
  node: MapNodeView;
  playerPower: number;
  currentCode: string | null;
  /** 当前地图的**全部**对象（P2.0 §3）；本组件按宿主 `nodeCode` 过滤后交给节点卡。 */
  objects?: readonly MapObjectView[];
  /** 「前往 / 传送」请求进行中（按钮级 loading；面板内容不卸载）。 */
  moving?: boolean;
  /** 正在移动的目标节点 code。 */
  movingTo?: string | null;
  /**
   * §22：节点专属的**就地交互区**（当前只有第八峰·后山 → 秘境石台）。
   * 由容器（`MapPanel`）决定给不给、给什么 —— 本组件只负责挂上去，保持纯展示。
   */
  realmSection?: ReactNode;
  onEnter: (code: string) => void;
  onWaypoint: (code: string) => void;
}

export function MapDetailPanel(props: MapDetailPanelProps) {
  const {
    node,
    playerPower,
    currentCode,
    objects = [],
    moving = false,
    movingTo = null,
    realmSection,
    onEnter,
    onWaypoint,
  } = props;
  const state = nodeVisualState(node, currentCode);
  const nodeObjects = objects.filter((object) => object.nodeCode === node.code);
  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="地点详情"
        subtitle={`${nodeStateLabel(state)} · ${detailSubtitleTail(node)}`}
      >
        <MapNodeCard
          node={node}
          playerPower={playerPower}
          current={state === 'current'}
          objects={nodeObjects}
          moving={moving}
          movingTo={movingTo}
          onEnter={onEnter}
          onWaypoint={onWaypoint}
        />
      </SectionCard>
      {realmSection}
    </Flex>
  );
}
