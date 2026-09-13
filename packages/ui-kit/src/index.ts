/**
 * `@idle-path/ui-kit` —— 通用 UI 组件层。
 *
 * 硬约束（规划 09 §6.3）：
 * - 只依赖 `antd` + `react`；**禁止** import `@idle-path/*`、`mobx`、`node:*`（由 `package.json` 与源码红线测试双重保证）；
 * - 组件一律**受控 + props 驱动**，不依赖任何 store；数据与回调由容器注入；
 * - 一组件一目录一文件，一个文件只导出一个组件。
 */
export {
  COMPACT_ALWAYS_ON,
  DEFAULT_PRIMARY_COLOR,
  THEME_TOGGLE_LABELS,
  nextThemeMode,
  themeToggleLabel,
  type ThemeMode,
} from './theme/types.js';

export { buildThemeConfig, hasCompactAlgorithm, type BuildThemeConfigInput } from './theme/build-theme-config.js';

export { ThemeProvider, type ThemeProviderProps } from './theme/ThemeProvider/index.js';
export { ThemeToggle, type ThemeToggleProps } from './theme/ThemeToggle/index.js';
export { ThemeFloatButton, type ThemeFloatButtonProps } from './theme/ThemeFloatButton/index.js';
