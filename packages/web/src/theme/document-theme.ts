/**
 * `document.documentElement` 上的主题标记（防闪烁 + 原生控件配色）。
 *
 * ⚠️ 纪律：`data-theme` **不是样式来源**（避免规划 09 §6.1 A13 的「双主题系统」），
 * 它只用于：
 * 1. `index.html` 首帧内联脚本读取并预设，避免刷新时先亮后暗的闪烁；
 * 2. 原生控件（滚动条、表单）的 `color-scheme`。
 * 样式颜色一律来自 antd token（经 `token-css-vars.ts` 桥接）。
 *
 * 参数用结构化类型，便于在无 DOM 环境下单测。
 */
import type { ThemeMode } from '@idle-path/ui-kit';

export interface ThemeMarkTarget {
  dataset: DOMStringMap;
  style: CSSStyleDeclaration;
}

export function applyDocumentTheme(target: ThemeMarkTarget, mode: ThemeMode): void {
  target.dataset['theme'] = mode;
  target.style.colorScheme = mode;
}

/** 读回标记（非法值返回 null），供测试与诊断使用。 */
export function readDocumentTheme(target: ThemeMarkTarget): ThemeMode | null {
  const raw = target.dataset['theme'];
  return raw === 'light' || raw === 'dark' ? raw : null;
}
