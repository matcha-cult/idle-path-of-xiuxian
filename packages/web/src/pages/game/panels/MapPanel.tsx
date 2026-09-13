/**
 * `MapPanel` —— 地图（线路图 / 跑图 / 传送）。**地图层第一个面板，后续地图 2/3 的模板。**
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 我在哪、能去哪？→ **左画布**（`MapCanvas`，§14 坐标系）/ 列表视图兜底
 *   2. 去了能干什么？→ **右栏详情**（`MapDetailPanel` → `MapNodeCard`）
 *   3. 打过了算解锁了吗？→ 三态徽标 `MapNodeBadge` + 图例 `MapCanvasLegend`
 *
 * ## 交互契约（反直觉，必须记住，§12.1）
 * - **点击枢纽只选中，绝不移动**；移动只走右栏「前往此地」按钮（PC 双击是快捷键）；
 * - 底部常驻提示条教这条规则（`MapHintBar`），否则玩家以为「点不动 = 坏了」。
 *
 * ## 口径（任务书 §3 / §6）
 * - **挂载时不拉取**：首屏由 `RootStore.loadPanel()` 并发加载；
 * - 三态交给 `AsyncBoundary`；业务失败由 store 走 toast 出口，面板**不重判** `data.success`；
 * - 服务端只下发已发现节点与两端均已发现的边，面板**不得自行造节点**，也不过滤；
 * - 坐标缺失 / 坐标空间非法（老服务端、手改种子）→ 自动降级到**列表视图**，不崩；
 * - 开发者网格走 `resolveMapDebug(env, search)`（纯前端，后端与协议零参与，§13.1）；
 * - **`loading`（骨架屏）只用于首屏 / 整图重载**：移动期间面板不卸载，反馈落按钮（B1 修复）；
 * - 协议字段不上屏：`code` 只做 key/testid，`featureKey` 原文不展示。
 */
import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Col, Drawer, Flex, Grid, Row, Segmented } from 'antd';
import { AsyncBoundary, SectionCard, StatGrid } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { MapCanvas } from './map/MapCanvas.js';
import { MapCanvasLegend } from './map/MapCanvasLegend.js';
import { MapDetailPanel } from './map/MapDetailPanel.js';
import { MapHintBar } from './map/MapHintBar.js';
import { MapNodeList } from './map/MapNodeList.js';
import { MapViewSwitch } from './map/MapViewSwitch.js';
import { isCanvasGridReady } from './map/canvas-view.js';
import { resolveMapDebug } from './map/debug-flags.js';
import { isSecretRealm } from './map/presentation.js';

/** 画布高度：整图适配按面板短边算，太扁会把图压小（§14.4 面板短边 ≥ 462px）。 */
const CANVAS_HEIGHT = 520;

export const MapPanel = observer(function MapPanel() {
  const root = useRootStore();
  const { map } = root;
  const screens = Grid.useBreakpoint();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [view, setView] = useState<'canvas' | 'list'>('canvas');
  const [detailOpen, setDetailOpen] = useState(false);
  const lastTap = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const nodes = map.nodes;
  const currentMap = map.currentMap;
  const gridRows = currentMap?.gridRows ?? 0;
  const gridCols = currentMap?.gridCols ?? 0;
  const gridReady = isCanvasGridReady(gridRows, gridCols);
  const debug = resolveMapDebug(import.meta.env, window.location.search);
  const mode = gridReady ? view : 'list'; // 坐标不可用（老服务端/手改种子）→ 列表视图，绝不用 NaN 定位
  const compact = screens.md === false; // `<md` 上下堆叠 + 详情降级为 Drawer（§12.2）；断点未就绪按桌面

  // 详情默认落在当前所在节点；没有位置时退回第一个已发现节点（可能是 null）。
  const fallback = nodes.find((node) => node.code === map.currentCode) ?? nodes[0] ?? null;
  const selected = nodes.find((node) => node.code === selectedCode) ?? fallback;
  const waypointCount = nodes.filter((node) => node.progress.waypointUnlocked).length;
  const idleUnlockedCount = map.progress.filter((progress) => progress.idleUnlocked).length;

  /** 点击枢纽 / 列表项：**只选中**（绝不移动）。 */
  const selectNode = (code: string): void => {
    setSelectedCode(code);
    setDetailOpen(true);
  };

  /** 前往：唯一的规范移动路径（右栏按钮）。 */
  const goToNode = (code: string): void => {
    setSelectedCode(code);
    setDetailOpen(false);
    void map.enter(code);
  };

  /** 枢纽点击：单击只选中；双击（仅 PC）直达。 */
  const pickNode = (code: string, source: 'tap' | 'double'): void => {
    if (source === 'double') {
      lastTap.current = { code: '', at: 0 };
      goToNode(code);
      return;
    }
    lastTap.current = { code, at: Date.now() };
    selectNode(code);
  };

  const enterRealm = (zoneCode: string): void => void root.zone.enter(zoneCode);
  const detail =
    selected === null ? null : (
      <MapDetailPanel
        node={selected}
        playerPower={map.playerPower}
        currentCode={map.currentCode}
        objects={map.objects}
        moving={map.moving}
        movingTo={map.movingTo}
        onEnter={goToNode}
        onWaypoint={(code) => void map.waypoint(code)}
        onEnterRealm={enterRealm}
      />
    );
  return (
    <Flex vertical gap={12}>
      <SectionCard
        title={currentMap?.name ?? '地图'}
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
            <MapViewSwitch value={mode} onChange={setView} />
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
            <Row gutter={[12, 12]} data-testid="map-main">
              {/* 宽屏画布 ≥62%（17/24≈70.8%）：原来 16/24 时右栏仍偏挤，点阵被压小 */}
              <Col xs={24} md={17} data-testid="map-route">
                {mode === 'canvas' ? (
                  <MapCanvas
                    nodes={nodes}
                    edges={map.edges}
                    gridRows={gridRows}
                    gridCols={gridCols}
                    currentCode={map.currentCode}
                    selectedCode={selected?.code ?? null}
                    onSelect={pickNode}
                    onBackgroundClick={() => setDetailOpen(false)}
                    showGrid={debug.showGrid}
                    height={CANVAS_HEIGHT}
                  />
                ) : (
                  <MapNodeList
                    nodes={nodes}
                    edges={map.edges}
                    currentCode={map.currentCode}
                    onSelect={selectNode}
                  />
                )}
              </Col>
              <Col xs={24} md={7} data-testid="map-detail">
                <Flex vertical gap={12}>
                  <MapCanvasLegend />
                  {compact ? (
                    <Button block data-testid="map-detail-open" onClick={() => setDetailOpen(true)}>
                      查看选中地点详情
                    </Button>
                  ) : (
                    detail
                  )}
                </Flex>
              </Col>
            </Row>
          </Flex>
        </AsyncBoundary>
      </SectionCard>

      {/* 移动端：详情降到「底部 Drawer」，画布占满宽度（§12.2） */}
      <Drawer
        data-testid="map-detail-drawer"
        title={selected?.name ?? '地点详情'}
        placement="bottom"
        open={compact && detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detail}
      </Drawer>

      <MapHintBar touch={compact} />
    </Flex>
  );
});
