/**
 * ThemeProvider —— antd 主题 + 上下文 + 中文化的统一包装（纯展示，受控）。
 *
 * 只做三件事：`ConfigProvider`（主题/locale）→ antd `App`（提供 `message/notification/modal` 上下文）。
 * 业务应用**禁止**再自行包一层 ConfigProvider，也禁止使用 `message.*` / `Modal.confirm` 静态方法
 * （脱离上下文会导致主题与 locale 失效，见规划 09 §6.1 A8）。
 */
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { buildThemeConfig } from '../build-theme-config.js';
import type { ThemeMode } from '../types.js';

export interface ThemeProviderProps {
  /** 主题态（受控，只有 light/dark）。 */
  mode: ThemeMode;
  /** 覆盖主题色；缺省用 `DEFAULT_PRIMARY_COLOR`。 */
  primaryColor?: string;
  /** antd locale，缺省中文。 */
  locale?: typeof zhCN;
  /** antd App 容器 class（布局用）。 */
  className?: string;
  /** antd App 最外层 class。 */
  rootClassName?: string;
  children: ReactNode;
}

export function ThemeProvider(props: ThemeProviderProps) {
  const { mode, primaryColor, locale, className, rootClassName, children } = props;
  return (
    <ConfigProvider
      theme={buildThemeConfig(primaryColor === undefined ? { mode } : { mode, primaryColor })}
      locale={locale ?? zhCN}
    >
      <AntApp className={className} rootClassName={rootClassName}>
        {children}
      </AntApp>
    </ConfigProvider>
  );
}
