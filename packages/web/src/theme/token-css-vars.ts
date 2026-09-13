/**
 * antd token → CSS 变量桥（**全仓唯一的样式取值通道**）。
 *
 * 为什么需要：antd v6 的 CSS 变量挂在 Provider 容器上，而 `body`、外层布局等
 * 在 Provider 之外读不到；这里把必要 token 显式写到 `documentElement`，
 * 供极少量布局胶水 CSS 使用。
 *
 * 纪律：
 * - 变量值**只能来自 antd token**，不得手写 hex（否则就是 09 §6.1 A13 的双主题系统）；
 * - 变量清单集中在此，禁止在组件里 `style={{ color: '#xxx' }}`（A9）。
 */
import type { GlobalToken } from 'antd';

/** CSS 变量 → antd token 的固定映射（新增需在此登记并补测试）。 */
export const TOKEN_CSS_VAR_MAP = {
  '--app-bg': 'colorBgLayout',
  '--app-bg-soft': 'colorBgContainer',
  '--app-bg-card': 'colorBgElevated',
  '--app-border': 'colorBorderSecondary',
  '--app-text': 'colorText',
  '--app-text-dim': 'colorTextSecondary',
  '--app-accent': 'colorPrimary',
  '--app-accent-dim': 'colorPrimaryBorder',
  '--app-ok': 'colorSuccess',
  '--app-warn': 'colorWarning',
  '--app-bad': 'colorError',
  /** 实心主色之上的文字色（按钮/激活页签） */
  '--app-on-accent': 'colorTextLightSolid',
} as const satisfies Record<string, keyof GlobalToken>;

export type TokenCssVarName = keyof typeof TOKEN_CSS_VAR_MAP;

export interface CssVarTarget {
  style: Pick<CSSStyleDeclaration, 'setProperty'>;
}

/**
 * 把 token 写入目标元素的 CSS 变量。
 * 边界：token 未定义 / 空串 / 非有限数字一律**跳过**（保留 CSS 里的兜底值，而不是写入 `undefined`）。
 */
export function applyTokenCssVars(target: CssVarTarget, token: Partial<GlobalToken>): void {
  for (const cssVar of Object.keys(TOKEN_CSS_VAR_MAP) as TokenCssVarName[]) {
    const tokenKey = TOKEN_CSS_VAR_MAP[cssVar];
    const value: unknown = token[tokenKey];
    if (typeof value === 'string') {
      if (value.length > 0) target.style.setProperty(cssVar, value);
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      target.style.setProperty(cssVar, String(value));
    }
  }
}
