/**
 * MapPanel —— 地图（线路图 / 跑图 / 传送）。**地图层第一个面板，后续地图 2/3 的模板。**
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 我在哪、能去哪？→ 「线路图」`MapRouteCard`（按环层分组，当前节点高亮，邻接可见）
 *   2. 去了能干什么？→ 「地点详情」`MapNodeCard`（怪物境界 / 门槛对比 / 传送点 / 承载系统）
 *   3. 打过了算解锁了吗？→ 三态徽标 `MapNodeBadge`（已到达 / 传送点已点亮 / 离线挂机已解锁）
 *
 * 口径（任务书 §3 / §6）：
 * - **挂载时不拉取**：首屏由 `RootStore.loadPanel()` 并发加载；
 * - 三态交给 `AsyncBoundary`；业务失败（`NODE_LOCKED` / `NODE_POWER_NOT_ENOUGH` /
 *   `WAYPOINT_NOT_UNLOCKED`）由 store 走 toast 出口，面板**不重判** `data.success`；
 * - 服务端只下发已发现节点与两端均已发现的边，面板**不得自行造节点**，也不过滤；
 * - 战力/门槛只用服务端 `playerPower` 与节点 `threshold` 对比，面板不做任何计算；
 * - 协议字段不上屏：`code` 只做 key/testid，`featureKey` 原文不展示。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex, Segmented } from 'antd';
import { AsyncBoundary, SectionCard, StatGrid } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { MapNodeCard } from './map/MapNodeCard.js';
import { MapRouteCard } from './map/MapRouteCard.js';
import { isSecretRealm } from './map/presentation.js';

export const MapPanel = observer(function MapPanel() {
  const root = useRootStore();
  const { map } = root;
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const nodes = map.nodes;
  // 详情默认落在当前所在节点；没有位置时退回第一个已发现节点（可能是 null）。
  const fallback = nodes.find((node) => node.code === map.currentCode) ?? nodes[0] ?? null;
  const selected = nodes.find((node) => node.code === selectedCode) ?? fallback;
  const waypointCount = nodes.filter((node) => node.progress.waypointUnlocked).length;
  const idleUnlockedCount = map.progress.filter((progress) => progress.idleUnlocked).length;

  /** 跑图：先选中（详情立刻切过去），再交给 store 发动作。 */
  const goToNode = (code: string): void => {
    setSelectedCode(code);
    void map.enter(code);
  };

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title={map.currentMap?.name ?? '地图'}
        subtitle="沿线路图推进：到达即发现，首次到达点亮传送点"
        extra={
          <Flex gap={8} wrap align="center">
            {map.maps.length > 1 ? (
              <Segmented
                value={map.selectedMapCode ?? undefined}
                onChange={(value) => map.selectMap(String(value))}
                options={map.maps.map((entry) => ({ label: entry.name, value: entry.code }))}
              />
            ) : null}
            <Button onClick={() => void map.load()} data-testid="map-refresh">
              刷新地图
            </Button>
          </Flex>
        }
      >
        <AsyncBoundary
          loading={map.loading}
          error={map.error}
          empty={nodes.length === 0}
          emptyText="暂无可显示的地点"
          onRetry={() => void map.load()}
        >
          <Flex vertical gap={12}>
            <div data-testid="map-overview">
              <StatGrid
                items={[
                  { key: 'power', label: '我的战力', value: map.playerPower },
                  { key: 'nodes', label: '已发现地点', value: nodes.length },
                  { key: 'waypoints', label: '已点亮传送点', value: waypointCount },
                  { key: 'secretRealms', label: '秘境', value: nodes.filter(isSecretRealm).length },
                  { key: 'idle', label: '已解锁离线挂机', value: idleUnlockedCount },
                ]}
              />
            </div>

            <div data-testid="map-route">
              <MapRouteCard
                nodes={nodes}
                edges={map.edges}
                currentCode={map.currentCode}
                onSelect={setSelectedCode}
              />
            </div>
          </Flex>
        </AsyncBoundary>
      </SectionCard>

      {selected === null ? null : (
        <SectionCard title="地点详情" subtitle="门槛对比 / 传送点 / 承载系统">
          <MapNodeCard
            node={selected}
            playerPower={map.playerPower}
            current={selected.code === map.currentCode}
            onEnter={goToNode}
            onWaypoint={(code) => void map.waypoint(code)}
            // 秘境节点的「进入历练」：把挂机目标切到该秘境（用户定调：挂机只能在历练秘境峰）。
            // 用 `zone.enter` 而不是在这里改 map 状态 —— 秘境的目标与层数归 zone 域。
            onEnterRealm={(zoneCode) => void root.zone.enter(zoneCode)}
          />
        </SectionCard>
      )}
    </Flex>
  );
});
