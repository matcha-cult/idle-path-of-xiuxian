import { observer } from 'mobx-react-lite';
import { useRootStore } from './root-context.js';
import { ToastBridge } from '../components/ToastBridge.js';
import { AppThemeToggle } from '../components/AppThemeToggle.js';
import { LoginPage } from '../pages/LoginPage.js';
import { CharacterCreatePage } from '../pages/CharacterCreatePage.js';
import { GameShellPage } from '../pages/game/GameShellPage.js';
import { MapLabPage } from '../pages/map-lab/MapLabPage.js';
import { shouldUseMapLab } from '../pages/map-lab/entry-flag.js';
import { MapStagePage } from '../pages/map-stage/MapStagePage.js';
import { shouldUseMapStage } from '../pages/map-stage/entry-flag.js';

/**
 * 顶层三态门（无 router）：未登录 → 登录页；已登录未建角 → 建角页；已建角 → 游戏面板壳。
 *
 * 全局挂载两件容器：`ToastBridge`（ToastStore → antd message）与 `AppThemeToggle`
 *（一键亮/暗切换，未登录页也可用）。
 *
 * **地图重做舞台**（2026-09-15）：地址栏带 `?mapStage=1` 时改挂 `MapStagePage`
 * （纯 canvas，第一步：42×42 网格 + 坐标读数）。该页**不依赖任何 store**，
 * 因此主题切换按钮由这里补挂（画布要用亮暗两套 token 各验一遍）。
 *
 * **地图交互实践入口**（2026-09-15，上一轮）：地址栏带 `?mapLab=1` 时，已建角分支改挂
 * `MapLabPage`（canvas 混合渲染链路）。两个入口**互不影响**，可来回切换对比。
 * **不带参数时行为与今天完全一致** —— 旧 `MapPanel` / `GameShellPage` 一行未改
 *（用户要求「保留旧页面入口」、「不能在存量临时方案中直接进行修改」）。
 * 判定都是纯函数，见各自的 `pages/<名字>/entry-flag.ts`。
 */
export const App = observer(function App() {
  const root = useRootStore();
  const inGame = root.session.isAuthenticated && root.session.hasCharacter;
  const mapStage = shouldUseMapStage(window.location.search);

  return (
    <div className={inGame ? 'app app--game' : 'app'}>
      <ToastBridge />
      {/* 游戏外壳的 HUD 里已有主题切换按钮；未进游戏或走地图舞台时用悬浮按钮（那里没有 HUD） */}
      {inGame && !mapStage ? null : <AppThemeToggle />}
      {!root.session.isAuthenticated ? (
        <LoginPage />
      ) : !root.session.hasCharacter ? (
        <CharacterCreatePage />
      ) : mapStage ? (
        <MapStagePage />
      ) : shouldUseMapLab(window.location.search) ? (
        <MapLabPage />
      ) : (
        <GameShellPage />
      )}
    </div>
  );
});
