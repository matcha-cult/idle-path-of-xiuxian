/**
 * `MapOverview` —— 地图概览统计（战力 / 地点 / 传送点 / 已突破秘境 / 可突破秘境）。
 *
 * 从 `MapPanel` 拆出（单文件 200 行纪律 + 单一职责）：本组件纯展示、受控、零推导，
 * 数字全部由容器从 store 传入。
 *
 * §22：原先的「秘境 / 已解锁离线挂机」两格已换成「已突破秘境 / 可突破秘境」——
 * 秘境与地图解耦后，挂机解锁不再挂在地图节点上，统计改读突破名录。
 */
import { StatGrid } from '@idle-path/ui-kit';

export interface MapOverviewProps {
  playerPower: number;
  /** 已发现地点数（服务端只下发已发现节点）。 */
  nodeCount: number;
  /** 已点亮传送点数。 */
  waypointCount: number;
  /** 已突破秘境数（§22：来自突破名录的已突破项）。 */
  clearedRealmCount: number;
  /** 当前可突破秘境数（免费历练秘境）。 */
  breakthroughableCount: number;
}

export function MapOverview(props: MapOverviewProps) {
  const { playerPower, nodeCount, waypointCount, clearedRealmCount, breakthroughableCount } = props;

  return (
    <div data-testid="map-overview">
      <StatGrid
        items={[
          { key: 'power', label: '我的战力', value: playerPower },
          { key: 'nodes', label: '已发现地点', value: nodeCount },
          { key: 'waypoints', label: '已点亮传送点', value: waypointCount },
          { key: 'clearedRealms', label: '已突破秘境', value: clearedRealmCount },
          { key: 'breakthroughable', label: '可突破秘境', value: breakthroughableCount },
        ]}
      />
    </div>
  );
}