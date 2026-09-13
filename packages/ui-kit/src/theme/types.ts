/**
 * 主题契约（规划 09 §2.1 D3）。
 *
 * **只有亮/暗两态**：不做 `'system'` 第三态，避免「三态切换 + OS 事件监听 + 首帧竞态」。
 * 紧凑（compact）不是配置项，而是恒定行为 —— 见 `COMPACT_ALWAYS_ON`，不提供开关，
 * 以免出现「关掉紧凑后布局错位」与 PC/移动端双份适配验证成本。
 */

/** 主题态：亮 / 暗（无第三态）。 */
export type ThemeMode = 'light' | 'dark';

/**
 * 主题色默认值（**全仓唯一常量处**）。
 *
 * 不开放 UI 选择器（D3）：将来若开放，只在此处与选择器层改动，组件不变。
 */
export const DEFAULT_PRIMARY_COLOR = '#2f9e8f';

/**
 * 紧凑恒定开启（不是可配置项）。
 *
 * 作为显式常量导出，使「紧凑是必须的」这一决策在类型与测试层面可见、可断言。
 */
export const COMPACT_ALWAYS_ON = true as const;

/** 取相反主题态（一键切换的语义核心，纯函数）。 */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === 'dark' ? 'light' : 'dark';
}

/** 主题切换按钮的默认文案。 */
export const THEME_TOGGLE_LABELS = {
  light: '切换到亮色主题',
  dark: '切换到暗色主题',
} as const;

/** 计算「点击后将切到哪一态」对应的提示文案。 */
export function themeToggleLabel(mode: ThemeMode): string {
  return THEME_TOGGLE_LABELS[nextThemeMode(mode)];
}
