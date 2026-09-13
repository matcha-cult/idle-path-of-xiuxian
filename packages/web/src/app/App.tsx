import { observer } from 'mobx-react-lite';
import { useRootStore } from './root-context.js';
import { ToastHost } from '../components/ToastHost.js';
import { LoginPage } from '../pages/LoginPage.js';
import { CharacterCreatePage } from '../pages/CharacterCreatePage.js';
import { GamePanelPage } from '../pages/GamePanelPage.js';
import { AppThemeToggle } from '../components/AppThemeToggle.js';

/**
 * 顶层路由（无 router：三态门）
 * 未登录 → 登录页；已登录未建角 → 建角页；已建角 → 游戏面板。
 */
export const App = observer(function App() {
  const root = useRootStore();

  return (
    <div className="app">
      <ToastHost />
      <AppThemeToggle />
      {!root.session.isAuthenticated ? (
        <LoginPage />
      ) : !root.session.hasCharacter ? (
        <CharacterCreatePage />
      ) : (
        <GamePanelPage />
      )}
    </div>
  );
});
