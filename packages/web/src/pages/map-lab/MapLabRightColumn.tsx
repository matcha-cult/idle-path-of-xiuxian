/**
 * `MapLabRightColumn` —— 新入口的**右栏**（「右边地图内可交互对象」+ 选中地点的动作面）。
 *
 * 从 `MapLabPage` 抽出来的理由：页面要守住 web 的单文件 ≤200 行红线；且「右栏由什么组成」
 * 本身是一件事 —— 图例 + 全图可交互对象清单 + 该地点的传送点交互 + 前往/传送按钮 + 秘境石台。
 *
 * 口径（都是**纯展示 + 回调**，不读 store、不判定可达性 —— 判定全在 `waypoint-gate.ts`）：
 * - 对象清单列**整张图**的对象，点任意一条只把画布焦点移过去（与「点击枢纽只选中」同一原则）；
 * - 传送点交互区与移动按钮都只对**当前选中**的地点显示，没选中（图还没数据）时整块不渲染；
 * - 秘境石台只在 `featureKey === realm` 时挂出（原样复用 §22 已交付的交互区）。
 */
import { Flex } from 'antd';
import type { MapNodeView } from '@idle-path/ionet-transport';
import { MapCanvasLegend } from '../game/panels/map/MapCanvasLegend.js';
import { REALM_FEATURE_KEY } from '../game/panels/map/feature-registry.js';
import { MapLabObjectPanel } from './MapLabObjectPanel.js';
import { MapLabRealmSection } from './MapLabRealmSection.js';
import { MapLabTravelCard } from './MapLabTravelCard.js';
import { WaypointInteractCard } from './WaypointInteractCard.js';
import type { LabObject } from './lab-objects.js';
import { travelDecision, type TravelKind } from './waypoint-gate.js';

export interface MapLabRightColumnProps {
  /** 本图全部可交互对象（已在容器里去重归类）。 */
  objects: readonly LabObject[];
  /** 当前选中的地点；`null` = 图里还没有数据。 */
  selected: MapNodeView | null;
  currentCode: string | null;
  /** 本会话已交互点亮的传送点。 */
  unlocked: ReadonlySet<string>;
  moving: boolean;
  movingTo: string | null;
  onFocusNode: (nodeCode: string) => void;
  onInteract: (nodeCode: string) => void;
  onTravel: (nodeCode: string, kind: TravelKind) => void;
}

export function MapLabRightColumn(props: MapLabRightColumnProps) {
  const { objects, selected, currentCode, unlocked, moving, movingTo, onFocusNode, onInteract, onTravel } =
    props;

  return (
    <Flex vertical gap={12} data-testid="map-lab-right-column">
      <MapCanvasLegend />
      <MapLabObjectPanel
        objects={objects}
        selectedNodeCode={selected?.code ?? null}
        onFocusNode={onFocusNode}
      />
      {selected === null ? null : (
        <>
          <WaypointInteractCard
            node={selected}
            currentCode={currentCode}
            unlocked={unlocked}
            onInteract={onInteract}
          />
          <MapLabTravelCard
            node={selected}
            decision={travelDecision(selected, currentCode, unlocked)}
            moving={moving}
            movingTo={movingTo}
            onTravel={onTravel}
          />
        </>
      )}
      {selected?.featureKey === REALM_FEATURE_KEY ? <MapLabRealmSection /> : null}
    </Flex>
  );
}
