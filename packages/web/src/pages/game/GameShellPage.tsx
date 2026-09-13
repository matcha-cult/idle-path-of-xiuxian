/**
 * GameShellPage —— 游戏外壳（**只做装配**）。
 *
 * 结构（`AppShell` 内置「侧栏固定 + 页头吸顶 + 内容滚动」）：
 *   ├─ nav     `NavBrand`（品牌，折叠只留图标）+ `SideNav`（分组菜单）
 *   ├─ header  角色身份：昵称 + 头衔 + 境界（身份信息归页头，不占 HUD）
 *   ├─ hud     `GameHud`（灵韵/玉简/秘境/战力/待结算 + 连接诊断 + 换肤）
 *   └─ content `Card` 包住当前域内容（已实现 → 面板；待重做 → 占位）
 *
 * 新增游戏域不需要改本文件（只改 `panel-registry.tsx`）。
 */
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Space, Tag, Typography, theme } from 'antd';
import { ThunderboltFilled } from '@ant-design/icons';
import { REALMS } from '@idle-path/ionet-transport';
import { AppShell, NavBrand, SideNav } from '@idle-path/ui-kit';
import { useRootStore } from '../../app/root-context.js';
import { GameHud } from '../../components/GameHud.js';
import {
  createGamePanelGroups,
  getGameDomain,
  listGameDomainKeys,
  renderGameDomainContent,
} from './panel-registry.js';

function realmNameOf(realm: number | undefined): string {
  if (realm === undefined) return '—';
  return REALMS[realm - 1] ?? `第 ${realm} 境`;
}

export const GameShellPage = observer(function GameShellPage() {
  const root = useRootStore();
  const { token } = theme.useToken();
  const groups = useMemo(() => createGamePanelGroups(), []);
  const [activeKey, setActiveKey] = useState(() => listGameDomainKeys()[0] ?? '');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void root.loadPanel();
  }, [root]);

  const character = root.session.character;
  const activeDomain = getGameDomain(activeKey);

  return (
    <AppShell
      collapsed={collapsed}
      onCollapse={setCollapsed}
      nav={
        <>
          <NavBrand
            icon={<ThunderboltFilled style={{ color: token.colorPrimary }} />}
            title="修仙之路"
            subtitle="放置·idle"
            collapsed={collapsed}
          />
          <SideNav groups={groups} selectedKey={activeKey} onSelect={setActiveKey} collapsed={collapsed} />
        </>
      }
      header={
        <Space align="center" wrap data-testid="shell-identity">
          <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
            {character?.nickname ?? '—'}
          </Typography.Text>
          <Tag>{character?.title ?? '散修'}</Tag>
          <Tag color="blue" data-testid="shell-realm">
            {realmNameOf(character?.realm)}
          </Tag>
        </Space>
      }
      headerExtra={
        <Button onClick={() => void root.loadPanel()} data-testid="shell-refresh-all">
          全量刷新
        </Button>
      }
      hud={<GameHud />}
    >
      <Card
        data-testid="shell-content"
        // 面板自带标题（SectionCard）时这里不再重复标题，只做「页面卡片」容器
        variant="borderless"
        title={activeDomain?.status === 'pending' ? activeDomain.label : undefined}
        // 拉伸填满内容区（AppShell 的 Content 是纵向 flex），避免底部大片留白
        style={{ flex: 1 }}
        styles={{ body: { minHeight: 320 } }}
      >
        {renderGameDomainContent(activeKey)}
      </Card>
    </AppShell>
  );
});
