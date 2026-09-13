/**
 * SideNav —— 分组侧栏导航（配置驱动，可插拔）。
 *
 * 只渲染 `Menu`（不含 `Sider`/折叠控制——那是 `AppShell` 的职责），
 * 因此同一份配置也能喂给顶栏或抽屉形态。
 *
 * 边界：`groups=[]` 时渲染空菜单不崩；`selectedKey` 不在任何分组内时不选中任何项；
 * 单项 `disabled` 透传给 antd（不可点击）。
 */
import { Flex, Menu } from 'antd';
import type { ReactNode } from 'react';

export interface SideNavItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SideNavGroup {
  key: string;
  label: ReactNode;
  items: readonly SideNavItem[];
}

export interface SideNavProps {
  groups: readonly SideNavGroup[];
  /** 当前选中项（受控）。 */
  selectedKey: string;
  onSelect: (key: string) => void;
  /** 折叠态（透传 `Menu.inlineCollapsed`）。 */
  collapsed?: boolean;
  /** 侧栏顶部标题区。 */
  title?: ReactNode;
  /** 侧栏底部区（版本号/退出等）。 */
  footer?: ReactNode;
}

export function SideNav(props: SideNavProps) {
  const { groups, selectedKey, onSelect, collapsed, title, footer } = props;

  const items = groups.map((group) => ({
    type: 'group' as const,
    key: group.key,
    label: group.label,
    children: group.items.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon,
      disabled: item.disabled,
    })),
  }));

  return (
    <Flex vertical data-testid="side-nav-root">
      {title}
      <Menu
        mode="inline"
        items={items}
        selectedKeys={[selectedKey]}
        inlineCollapsed={collapsed}
        onClick={({ key }) => onSelect(key)}
        data-testid="side-nav-menu"
      />
      {footer}
    </Flex>
  );
}
