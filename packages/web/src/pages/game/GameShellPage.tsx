/**
 * GameShellPage —— 游戏面板壳（**只做装配**，目标 ≤80 行）。
 *
 * 职责边界：
 * - 页头（角色摘要）/ 工具条（连接状态）/ 内容（配置驱动的页签）三段，全部来自 ui-kit `PageShell` + `PanelTabs`；
 * - 面板清单来自 `panel-registry`：新增游戏域不需要改本文件；
 * - 首屏数据并发加载由 `RootStore.loadPanel()` 负责，面板自身不在挂载时拉取。
 */
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useState } from 'react';
import { Button, Space } from 'antd';
import { REALMS } from '@idle-path/ionet-transport';
import { PageShell, PanelTabs } from '@idle-path/ui-kit';
import { ConnectionStatus } from '../../components/ConnectionStatus.js';
import { useRootStore } from '../../app/root-context.js';
import { createGamePanelRegistry } from './panel-registry.js';

function realmNameOf(realm: number | undefined): string {
  if (realm === undefined) return '—';
  return REALMS[realm - 1] ?? `第 ${realm} 境`;
}

export const GameShellPage = observer(function GameShellPage() {
  const root = useRootStore();
  const registry = useMemo(() => createGamePanelRegistry(), []);
  const panels = registry.list();
  const [activeKey, setActiveKey] = useState(() => panels[0]?.key ?? '');

  useEffect(() => {
    void root.loadPanel();
  }, [root]);

  const character = root.session.character;

  return (
    <PageShell
      title={character?.nickname ?? '—'}
      subtitle={
        <Space separator="·" wrap data-testid="shell-character-summary">
          <span>{character?.title ?? '散修'}</span>
          <span>{realmNameOf(character?.realm)}</span>
          <span>灵石 {character?.spiritStones ?? 0}</span>
          <span>灵韵 {character?.lingyun ?? 0}</span>
          <span>玉简 {character?.jadeSlips ?? 0}</span>
        </Space>
      }
      extra={
        <Button type="primary" onClick={() => void root.loadPanel()} data-testid="shell-refresh-all">
          全量刷新
        </Button>
      }
      toolbar={<ConnectionStatus />}
    >
      <PanelTabs items={panels} activeKey={activeKey} onChange={setActiveKey} />
    </PageShell>
  );
});
