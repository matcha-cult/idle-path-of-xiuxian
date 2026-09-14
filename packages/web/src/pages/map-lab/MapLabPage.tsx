/**
 * `MapLabPage` —— **地图交互实践的新入口**（`?mapLab=1`，旧 `MapPanel` 一行不动）。
 *
 * ## 要验证的链路（用户北极星）
 * 「进入大地图 → 看到可交互对象 → 与对象/传送点交互 → 解锁传送与移动」：
 * 左 `CanvasGraph`（canvas 点阵/连线）· 右 `MapLabObjectPanel`（全图可交互对象）·
 * 选中「人在此地」的枢纽 → `WaypointInteractCard` 交互 → `MapLabTravelCard` 才给「传送至此」。
 * **未交互则不可传送**，哪怕服务端已 `waypointUnlocked`（见 `waypoint-gate.ts`）。
 *
 * ## 口径
 * - **挂载时拉一次**：本页不在 `GameShellPage` 之下，因此自己触发 `root.loadPanel()`；
 * - **移动期间面板不卸载**：`loading` 只用于首屏 / 整图重载，反馈落在按钮上（旧面板踩过白屏）；
 * - 坐标缺失 / 坐标空间非法 → 降级到既有**列表视图**（复用 `MapNodeList`），不崩；
 * - 主题一键切换：本页自带 `AppThemeToggle`（游戏外壳不在本页之下）；
 * - **自己补页边距**：`.app--game` 的 `padding: 0` 是留给 `AppShell` 的，本页不在那个壳里必须自己补；
 * - 协议字段不上屏：`code` 只做 key/testid。
 *
 * ⚠️ 「传送点亮」是**会话态**（`unlocked`），刷新即回初始（顶部常驻说明）；
 * 持久化需要后端 `map.interact`（`24-总待办与优先级.md` §2 B1），本轮不做。
 *
 * `?mapLabPerf=1` 额外挂开发者**帧率表**（掉帧数 / 最差帧），供真机验收读数字。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Col, Flex, Grid, Row, theme } from 'antd';
import { AsyncBoundary, SectionCard } from '@idle-path/ui-kit';
import { useRootStore } from '../../app/root-context.js';
import { AppThemeToggle } from '../../components/AppThemeToggle.js';
import { MapHintBar } from '../game/panels/map/MapHintBar.js';
import { MapNodeList } from '../game/panels/map/MapNodeList.js';
import { MapOverview } from '../game/panels/map/MapOverview.js';
import { MapToolbar } from '../game/panels/map/MapToolbar.js';
import { isCanvasGridReady } from '../game/panels/map/canvas-view.js';
import { resolveMapDebug } from '../game/panels/map/debug-flags.js';
import { MapLabCanvas } from './MapLabCanvas.js';
import { MapLabNotice } from './MapLabNotice.js';
import { LabFrameMeter } from './LabFrameMeter.js';
import { MapLabRightColumn } from './MapLabRightColumn.js';
import { buildLabObjects } from './lab-objects.js';
import { shouldShowFrameMeter } from './entry-flag.js';
import { travelDecision, unlockWaypoint, unlockedCount, type TravelKind } from './waypoint-gate.js';

/** 画布高度：整图适配按面板短边算，太扁会把图压小（§14.4）。 */
const CANVAS_HEIGHT = 520;
/** 模块级空数组：`currentMap` 为 null 时避免每次渲染都造新引用（会让 useMemo 失效）。 */
const NO_OBJECTS = [] as const;

export const MapLabPage = observer(function MapLabPage() {
  const root = useRootStore();
  const { map } = root;
  const { token } = theme.useToken();
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
  // 开发者帧率表：默认关（`?mapLabPerf=1`）—— 真机验收时用来读掉帧数与最差帧
  const showMeter = shouldShowFrameMeter(window.location.search);
  const compact = screens.md === false;

  const fallback = nodes.find((node) => node.code === map.currentCode) ?? nodes[0] ?? null;
  const selected = nodes.find((node) => node.code === selectedCode) ?? fallback;
  const labObjects = useMemo(
    () => buildLabObjects(nodes, currentMap?.objects ?? NO_OBJECTS, unlocked),
    [nodes, currentMap, unlocked],
  );

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
    <Flex vertical gap={12} data-testid="map-lab-page" style={{ padding: token.padding }}>
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
                <MapLabRightColumn
                  objects={labObjects}
                  selected={selected}
                  currentCode={map.currentCode}
                  unlocked={unlocked}
                  moving={map.moving}
                  movingTo={map.movingTo}
                  onFocusNode={setSelectedCode}
                  onInteract={interactWaypoint}
                  onTravel={travel}
                />
              </Col>
            </Row>
          </Flex>
        </AsyncBoundary>
      </SectionCard>
      {showMeter ? <LabFrameMeter /> : null}
      <MapHintBar touch={compact} />
      <AppThemeToggle />
    </Flex>
  );
});
