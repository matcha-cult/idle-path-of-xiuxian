import { observer } from 'mobx-react-lite';
import { useRootStore } from './root-context.js';
import { ToastBridge } from '../components/ToastBridge.js';
import { AppThemeToggle } from '../components/AppThemeToggle.js';
import { LoginPage } from '../pages/LoginPage.js';
import { CharacterCreatePage } from '../pages/CharacterCreatePage.js';
import { GameShellPage } from '../pages/game/GameShellPage.js';
import { MapLabPage } from '../pages/map-lab/MapLabPage.js';
import { shouldUseMapLab } from '../pages/map-lab/entry-flag.js';

/**
 * 顶层三态门（无 router）：未登录 → 登录页；已登录未建角 → 建角页；已建角 → 游戏面板壳。
 *
 * 全局挂载两件容器：`ToastBridge`（ToastStore → antd message）与 `AppThemeToggle`
 *（一键亮/暗切换，未登录页也可用）。
 *
 * **地图交互实践入口**（2026-09-15）：地址栏带 `?mapLab=1` 时，已建角分支改挂
 * `MapLabPage`（新的 canvas 混合渲染链路）；**不带参数时行为与今天完全一致** ——
 * 旧 `MapPanel` / `GameShellPage` 一行未改（用户要求「保留旧页面入口」、
 * 「不能在存量临时方案中直接进行修改」）。判定是纯函数，见 `map-lab/entry-flag.ts`。
 */
export const App = observer(function App() {
  const root = useRootStore();
  const inGame = root.session.isAuthenticated && root.session.hasCharacter;

  return (
    <div className={inGame ? 'app app--game' : 'app'}>
      <ToastBridge />
      {/* 游戏外壳的 HUD 里已有主题切换按钮；未进游戏时用悬浮按钮（登录页也能换肤） */}
      {inGame ? null : <AppThemeToggle />}
      {!root.session.isAuthenticated ? (
        <LoginPage />
      ) : !root.session.hasCharacter ? (
        <CharacterCreatePage />
      ) : shouldUseMapLab(window.location.search) ? (
        <MapLabPage />
      ) : (
        <GameShellPage />
      )}
    </div>
  );
});
