/**
 * antd 主题配置构造（**纯函数**，优先单测）。
 *
 * 紧凑恒开：`compactAlgorithm` 永远在 algorithm 数组中（见 `COMPACT_ALWAYS_ON`），
 * 因此组件级不再各自设 `size`，避免「紧凑 + small」叠加错位。
 */
import { theme, type ThemeConfig } from 'antd';
import { COMPACT_ALWAYS_ON, DEFAULT_PRIMARY_COLOR, type ThemeMode } from './types.js';

export interface BuildThemeConfigInput {
  mode: ThemeMode;
  /** 覆盖主题色；缺省用 `DEFAULT_PRIMARY_COLOR`。 */
  primaryColor?: string;
}

export function buildThemeConfig(input: BuildThemeConfigInput): ThemeConfig {
  const base = input.mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm;
  // 边界：''/纯空白视为未提供（避免把空串写进 token 导致颜色失效）
  const override = input.primaryColor;
  const colorPrimary =
    typeof override === 'string' && override.trim() !== '' ? override : DEFAULT_PRIMARY_COLOR;
  return {
    // 紧凑恒在（COMPACT_ALWAYS_ON）；顺序：基色算法 → 紧凑派生
    algorithm: [base, theme.compactAlgorithm],
    token: {
      colorPrimary,
      borderRadius: 6,
    },
  };
}

/** 供测试/诊断：判定某模式下的 algorithm 是否恒含紧凑（常量恒为 true）。 */
export function hasCompactAlgorithm(input: BuildThemeConfigInput): boolean {
  if (!COMPACT_ALWAYS_ON) return false;
  const config = buildThemeConfig(input);
  const algorithms = Array.isArray(config.algorithm) ? config.algorithm : [config.algorithm];
  return algorithms.includes(theme.compactAlgorithm);
}
