/**
 * NavBrand —— 侧栏品牌区（图标 + 名称，折叠时只留图标）。
 *
 * 为什么单独成组件：折叠态下若仍渲染完整文字，会溢出被截断（原型里昵称被切成单字）；
 * 品牌区需要自己感知 `collapsed`。它属于通用布局件，故放 ui-kit 而非页面里。
 */
import { Flex, Typography, theme } from 'antd';
import type { ReactNode } from 'react';

export interface NavBrandProps {
  /** 品牌图标。 */
  icon?: ReactNode;
  /** 品牌名（折叠时隐藏）。 */
  title: ReactNode;
  /** 副标题（折叠时隐藏）。 */
  subtitle?: ReactNode;
  /** 折叠态。 */
  collapsed?: boolean;
}

export function NavBrand(props: NavBrandProps) {
  const { icon, title, subtitle, collapsed = false } = props;
  const { token } = theme.useToken();

  return (
    <Flex
      align="center"
      justify={collapsed ? 'center' : 'flex-start'}
      gap={token.paddingXS}
      data-testid="nav-brand-root"
      style={{
        padding: `${token.paddingSM}px ${token.padding}px`,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {icon}
      {collapsed ? null : (
        <Flex vertical>
          <Typography.Text strong data-testid="nav-brand-title">
            {title}
          </Typography.Text>
          {subtitle === undefined ? null : (
            <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {subtitle}
            </Typography.Text>
          )}
        </Flex>
      )}
    </Flex>
  );
}
