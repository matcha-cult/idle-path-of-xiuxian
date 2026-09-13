/**
 * AppShell —— 应用外壳骨架（`Layout` + 可折叠 `Sider` + `Header` + `Content`）。
 *
 * 只负责**结构与间距**，不承载任何业务：导航、HUD、页头操作都由插槽注入，
 * 因此换导航形态（侧栏 / 顶栏 / 抽屉）不影响业务代码（规划 09 §3 T-D 的可插拔取向）。
 *
 * 插槽：`nav`（Sider 内）/ `header`（页头左侧）/ `headerExtra`（页头右侧）/ `hud`（页头下方常驻信息条）/ `children`。
 * 边界：`header`/`headerExtra`/`hud` 各自可省略；只给 `hud` 时页头只渲染信息条那一行。
 * 颜色一律取 antd token（禁内联 hex）；不传 `size`（全局紧凑算法已生效）。
 */
import { Flex, Layout, theme } from 'antd';
import type { ReactNode } from 'react';

export interface AppShellProps {
  /** 左侧导航内容（通常传 `SideNav`）。 */
  nav: ReactNode;
  /** 页头左侧（角色名/面包屑等）。 */
  header?: ReactNode;
  /** 页头右侧操作区。 */
  headerExtra?: ReactNode;
  /** 页头下方的常驻信息条（通常传 `HudBar`）。 */
  hud?: ReactNode;
  /** 是否可折叠侧栏（默认 true）。 */
  collapsible?: boolean;
  /** 受控折叠态。 */
  collapsed?: boolean;
  /** 非受控初始折叠态。 */
  defaultCollapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  siderWidth?: number;
  children: ReactNode;
}

export function AppShell(props: AppShellProps) {
  const {
    nav,
    header,
    headerExtra,
    hud,
    collapsible = true,
    collapsed,
    defaultCollapsed,
    onCollapse,
    siderWidth = 208,
    children,
  } = props;
  const { token } = theme.useToken();
  const hasHeaderRow = header !== undefined || headerExtra !== undefined;

  return (
    <Layout style={{ minHeight: '100vh' }} data-testid="app-shell-root">
      <Layout.Sider
        theme="light"
        width={siderWidth}
        collapsible={collapsible}
        {...(collapsed === undefined ? {} : { collapsed })}
        {...(defaultCollapsed === undefined ? {} : { defaultCollapsed })}
        {...(onCollapse === undefined ? {} : { onCollapse })}
        style={{
          borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
        }}
        data-testid="app-shell-sider"
      >
        {nav}
      </Layout.Sider>

      <Layout>
        <Layout.Header
          data-testid="app-shell-header"
          style={{
            height: 'auto',
            lineHeight: 'normal',
            padding: `${token.paddingXS}px ${token.padding}px`,
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Flex vertical gap={token.paddingXS}>
            {hasHeaderRow ? (
              <Flex justify="space-between" align="center" wrap gap={token.paddingXS}>
                {header}
                {headerExtra}
              </Flex>
            ) : null}
            {hud}
          </Flex>
        </Layout.Header>

        <Layout.Content
          data-testid="app-shell-content"
          style={{ padding: token.padding, background: token.colorBgLayout }}
        >
          {children}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
