/**
 * ThemeRoot —— 主题容器：把 `ThemeStore` 的态接到 ui-kit 的 `ThemeProvider`。
 *
 * 位置要求：必须在 `RootStoreProvider` 之内、`App` 之外（因为要读 store、又要包住整棵树）。
 */
import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@idle-path/ui-kit';
import { useRootStore } from '../app/root-context.js';
import { TokenCssVarBridge } from './token-css-var-bridge.js';

export interface ThemeRootProps {
  children: ReactNode;
}

export const ThemeRoot = observer(function ThemeRoot({ children }: ThemeRootProps) {
  const { theme } = useRootStore();
  return (
    <ThemeProvider mode={theme.mode} className="app-root">
      <TokenCssVarBridge mode={theme.mode} />
      {children}
    </ThemeProvider>
  );
});
