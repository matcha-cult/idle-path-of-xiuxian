import { observer } from 'mobx-react-lite';
import { useRootStore } from './root-context.js';
import { ToastBridge } from '../components/ToastBridge.js';
import { AppThemeToggle } from '../components/AppThemeToggle.js';
import { LoginPage } from '../pages/LoginPage.js';
import { CharacterCreatePage } from '../pages/CharacterCreatePage.js';
import { GameShellPage } from '../pages/game/GameShellPage.js';

/**
 * 顶层三态门（无 router）：未登录 → 登录页；已登录未建角 → 建角页；已建角 → 游戏面板壳。
 *
 * 全局挂载两件容器：`ToastBridge`（ToastStore → antd message）与 `AppThemeToggle`
 *（一键亮/暗切换，未登录页也可用）。
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
      ) : (
        <GameShellPage />
      )}
    </div>
  );
});
