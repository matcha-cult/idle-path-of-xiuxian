/**
 * GameShellPage —— 游戏外壳（**只做装配**）。
 *
 * 结构：`AppShell`（Sider + Header + Content）
 *   ├─ `nav`       `SideNav`（分组侧栏，配置来自 `panel-registry`）
 *   ├─ `header`    角色名 + 全量刷新
 *   ├─ `hud`       `GameHud`（境界/资源 + 连接状态 + 主题切换）
 *   └─ `children`  当前域内容（注册表决定：已实现 → 面板；待重做 → 占位）
 *
 * 新增游戏域不需要改本文件（只改 `panel-registry.tsx`）。
 * 首屏数据由 `RootStore.loadPanel()` 并发加载；面板自身不在挂载时拉取。
 */
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useState } from 'react';
import { Button, Space, Typography } from 'antd';
import { AppShell, SideNav } from '@idle-path/ui-kit';
import { useRootStore } from '../../app/root-context.js';
import { GameHud } from '../../components/GameHud.js';
import {
  createGamePanelGroups,
  listGameDomainKeys,
  renderGameDomainContent,
} from './panel-registry.js';

export const GameShellPage = observer(function GameShellPage() {
  const root = useRootStore();
  const groups = useMemo(() => createGamePanelGroups(), []);
  const [activeKey, setActiveKey] = useState(() => listGameDomainKeys()[0] ?? '');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void root.loadPanel();
  }, [root]);

  const character = root.session.character;

  return (
    <AppShell
      collapsed={collapsed}
      onCollapse={setCollapsed}
      nav={
        <SideNav
          groups={groups}
          selectedKey={activeKey}
          onSelect={setActiveKey}
          collapsed={collapsed}
          title={
            <Typography.Text strong data-testid="shell-title">
              {character?.nickname ?? '—'}
            </Typography.Text>
          }
        />
      }
      header={<Typography.Text type="secondary">放置·修仙之路</Typography.Text>}
      headerExtra={
        <Space>
          <Button onClick={() => void root.loadPanel()} data-testid="shell-refresh-all">
            全量刷新
          </Button>
        </Space>
      }
      hud={<GameHud />}
    >
      <div data-testid="shell-content">{renderGameDomainContent(activeKey)}</div>
    </AppShell>
  );
});
