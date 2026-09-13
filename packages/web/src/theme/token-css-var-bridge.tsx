/**
 * TokenCssVarBridge —— 在 antd Provider **内部**把 token 同步到 `documentElement`，
 * 并写入 `data-theme` / `color-scheme` 标记。
 *
 * 必须放在 `ThemeProvider` 之内（依赖 `theme.useToken()` 的上下文）。
 * 使用 `useLayoutEffect` 而非 `useEffect`：变量在首帧绘制前落地，消除主题闪烁。
 * 本应用为纯客户端渲染，不存在 SSR 下 useLayoutEffect 警告的场景。
 * 渲染 `null`：它只做副作用，不产出 DOM。
 */
import { theme as antdTheme } from 'antd';
import { useLayoutEffect } from 'react';
import type { ThemeMode } from '@idle-path/ui-kit';
import { applyDocumentTheme } from './document-theme.js';
import { applyTokenCssVars } from './token-css-vars.js';

export interface TokenCssVarBridgeProps {
  mode: ThemeMode;
  /** 注入目标（测试用）；缺省 `document.documentElement`。 */
  target?: HTMLElement;
}

export function TokenCssVarBridge({ mode, target }: TokenCssVarBridgeProps) {
  const { token } = antdTheme.useToken();

  // useLayoutEffect：在浏览器绘制首帧之前写入变量，避免「先暗后亮」闪烁
  useLayoutEffect(() => {
    const element = target ?? (typeof document === 'undefined' ? undefined : document.documentElement);
    if (element === undefined) return;
    applyTokenCssVars(element, token);
    applyDocumentTheme(element, mode);
  }, [token, mode, target]);

  return null;
}
