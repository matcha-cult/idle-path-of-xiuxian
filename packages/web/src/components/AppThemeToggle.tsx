/**
 * AppThemeToggle —— 容器层：把 `ThemeStore` 接到 ui-kit 的悬浮主题按钮。
 *
 * 组件本身只做「store ↔ 受控组件」的桥接（展示逻辑全在 ui-kit，可独立单测）。
 */
import { observer } from 'mobx-react-lite';
import { ThemeFloatButton } from '@idle-path/ui-kit';
import { useRootStore } from '../app/root-context.js';

export const AppThemeToggle = observer(function AppThemeToggle() {
  const { theme } = useRootStore();
  return <ThemeFloatButton value={theme.mode} onChange={(mode) => theme.setMode(mode)} />;
});
