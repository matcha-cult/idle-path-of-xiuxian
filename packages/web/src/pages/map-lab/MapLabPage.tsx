/**
 * `MapLabPage` —— **地图交互实践的新入口**（`?mapLab=1`，旧 `MapPanel` 一行不动）。
 *
 * ## 这一页要验证的链路（用户北极星）
 * 「进入大地图 → 看到可交互对象 → 与对象/传送点交互 → 解锁传送与移动」
 * 1. **进入地图**：左侧是 `CanvasGraph`（canvas 画 n×n 点阵与连线 + DOM 放枢纽）；
 * 2. **看到可交互对象**：右侧 `MapLabObjectPanel` 列出**整张图**的传送点 / 秘境入口 / 职能入口；
 * 3. **与传送点交互**：选中「人在此地」的枢纽 → `WaypointInteractCard` 给交互按钮；
 * 4. **解锁传送与移动**：交互后 `unlocked` 加入该节点 → `MapLabTravelCard` 从「暂不可前往」
 *    变为「传送至此」。**未交互则不可传送**（哪怕服务端已 `waypointUnlocked`，见 `waypoint-gate.ts`）。
 *
 * ## 口径
 * - **挂载时拉一次**：本页不在 `GameShellPage` 之下，因此自己触发 `root.loadPanel()`；
 * - **移动期间面板不卸载**：`loading` 只用于首屏 / 整图重载，反馈落在按钮上（旧面板踩过白屏）；
 * - 坐标缺失 / 坐标空间非法 → 降级到既有**列表视图**（复用 `MapNodeList`），不崩；
 * - 主题一键切换：本页自带 `AppThemeToggle`（游戏外壳不在本页之下）；
 * - 协议字段不上屏：`code` 只做 key/testid。
 *
 * ⚠️ 「传送点亮」是**会话态**（`unlocked`），刷新即回初始 —— 页面顶部常驻说明；
 * 持久化需要后端 `map.interact`（`24-总待办与优先级.md` §2 B1），本轮不做。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Col, Flex, Grid, Row } from 'antd';
import { AsyncBoundary, SectionCard } from '@idle-path/ui-kit';
import { useRootStore } from '../../app/root-context.js';
import { AppThemeToggle } from '../../components/AppThemeToggle.js';
import { MapCanvasLegend } from '../game/panels/map/MapCanvasLegend.js';
import { MapHintBar } from '../game/panels/map/MapHintBar.js';
import { MapNodeList } from '../game/panels/map/MapNodeList.js';
import { MapOverview } from '../game/panels/map/MapOverview.js';
import { MapToolbar } from '../game/panels/map/MapToolbar.js';
import { REALM_FEATURE_KEY } from '../game/panels/map/feature-registry.js';
import { isCanvasGridReady } from '../game/panels/map/canvas-view.js';
import { resolveMapDebug } from '../game/panels/map/debug-flags.js';
import { MapLabCanvas } from './MapLabCanvas.js';
import { MapLabNotice } from './MapLabNotice.js';
import { MapLabObjectPanel } from './MapLabObjectPanel.js';
import { MapLabRealmSection } from './MapLabRealmSection.js';
import { MapLabTravelCard } from './MapLabTravelCard.js';
import { WaypointInteractCard } from './WaypointInteractCard.js';
import { buildLabObjects } from './lab-objects.js';
import { travelDecision, unlockWaypoint, unlockedCount, type TravelKind } from './waypoint-gate.js';

/** 画布高度：整图适配按面板短边算，太扁会把图压小（§14.4）。 */
const CANVAS_HEIGHT = 520;
/** 模块级空数组：`currentMap` 为 null 时避免每次渲染都造新引用（会让 useMemo 失效）。 */
const NO_OBJECTS = [] as const;

export const MapLabPage = observer(function MapLabPage() {
  const root = useRootStore();
  const { map } = root;
  const screens = Grid.useBreakpoint();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  /** 本会话已交互点亮的传送点 —— 这就是「交互才解锁传送」的门槛真值。 */
  const [unlocked, setUnlocked] = useState<ReadonlySet<string>>(() => new Set<string>());
  /** 只补一次首屏加载（见下方 effect）。 */
  const bootstrapped = useRef(false);

  useEffect(() => {
    // **面板挂载时不重复拉取**（本仓契约：首屏由 `RootStore.bootstrap/login` 的 `loadPanel()`
    // 并发加载）。这里只在「本页什么都没有」时补一次 —— 热重载 / 直接刷新到 `?mapLab=1` 的情况。
    // ⚠️ 不能无条件调用：WS 尚未就绪时会写 `map.error`，把整页换成错误态（首版就栽在这里）。
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (map.maps.length === 0) void root.loadPanel();
  }, [root, map]);

  const nodes = map.nodes;
  const currentMap = map.currentMap;
  const gridRows = currentMap?.gridRows ?? 0;
  const gridCols = currentMap?.gridCols ?? 0;
  const mode = isCanvasGridReady(gridRows, gridCols) ? 'canvas' : 'list';
  const debug = resolveMapDebug(import.meta.env, window.location.search);
  const compact = screens.md === false;

  const fallback = nodes.find((node) => node.code === map.currentCode) ?? nodes[0] ?? null;
  const selected = nodes.find((node) => node.code === selectedCode) ?? fallback;
  const labObjects = useMemo(
    () => buildLabObjects(nodes, currentMap?.objects ?? NO_OBJECTS, unlocked),
    [nodes, currentMap, unlocked],
  );
  // 秘境石台只在第八峰·后山（featureKey=realm）出现；原样复用 §22 已交付的交互区
  const realmSection = selected?.featureKey !== REALM_FEATURE_KEY ? null : <MapLabRealmSection />;

  /** 移动：唯一的规范路径（按钮 / PC 双击）。相邻走 `enter`，传送走 `waypoint`。 */
  const travel = (code: string, kind: TravelKind): void => {
    if (kind === 'walk') void map.enter(code);
    if (kind === 'teleport') void map.waypoint(code);
  };
  /** 枢纽点击：单击**只选中**；双击（仅 PC）直达（§12.1）。 */
  const pickNode = (code: string, source: 'tap' | 'double'): void => {
    setSelectedCode(code);
    if (source !== 'double') return;
    const node = nodes.find((entry) => entry.code === code);
    if (node === undefined) return;
    travel(code, travelDecision(node, map.currentCode, unlocked).kind);
  };
  /** 与传送点交互 → 点亮（会话态）。之后该地点才可被传送。 */
  const interactWaypoint = (nodeCode: string): void => {
    setUnlocked((prev) => unlockWaypoint(prev, nodeCode));
  };

  return (
    <Flex vertical gap={12} data-testid="map-lab-page">
      <MapLabNotice />
      <SectionCard
        title={`${currentMap?.name ?? '地图'} · 交互实践`}
        subtitle="canvas 混合渲染 · 与传送点交互后才解锁传送"
        extra={
          <MapToolbar
            maps={map.maps}
            selectedMapCode={map.selectedMapCode}
            onSelectMap={(code) => map.selectMap(code)}
            view={mode}
            onViewChange={() => undefined}
            onRefresh={() => void map.load()}
          />
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
            <MapOverview
              playerPower={map.playerPower}
              nodeCount={nodes.length}
              waypointCount={unlockedCount(nodes, unlocked)}
              clearedRealmCount={root.zone.zones.length}
              breakthroughableCount={root.zone.breakthrough.filter((entry) => entry.canBreakthrough).length}
            />
            <Row gutter={[12, 12]} data-testid="map-lab-main">
              <Col xs={24} md={17} data-testid="map-lab-canvas-col">
                {mode === 'canvas' ? (
                  <MapLabCanvas
                    nodes={nodes}
                    edges={map.edges}
                    gridRows={gridRows}
                    gridCols={gridCols}
                    currentCode={map.currentCode}
                    selectedCode={selected?.code ?? null}
                    unlocked={unlocked}
                    onSelect={pickNode}
                    onBackgroundClick={() => undefined}
                    showGrid={debug.showGrid}
                    height={CANVAS_HEIGHT}
                  />
                ) : (
                  <MapNodeList
                    nodes={nodes}
                    edges={map.edges}
                    currentCode={map.currentCode}
                    onSelect={setSelectedCode}
                  />
                )}
              </Col>
              <Col xs={24} md={7} data-testid="map-lab-objects-col">
                <Flex vertical gap={12}>
                  <MapCanvasLegend />
                  <MapLabObjectPanel
                    objects={labObjects}
                    selectedNodeCode={selected?.code ?? null}
                    onFocusNode={setSelectedCode}
                  />
                  {selected === null ? null : (
                    <>
                      <WaypointInteractCard
                        node={selected}
                        currentCode={map.currentCode}
                        unlocked={unlocked}
                        onInteract={interactWaypoint}
                      />
                      <MapLabTravelCard
                        node={selected}
                        decision={travelDecision(selected, map.currentCode, unlocked)}
                        moving={map.moving}
                        movingTo={map.movingTo}
                        onTravel={travel}
                      />
                    </>
                  )}
                  {realmSection}
                </Flex>
              </Col>
            </Row>
          </Flex>
        </AsyncBoundary>
      </SectionCard>
      <MapHintBar touch={compact} />
      <AppThemeToggle />
    </Flex>
  );
});
