/**
 * GameHud —— 常驻信息条容器：把角色 / 连接 / 主题接到 ui-kit `HudBar`。
 *
 * 只做「store → props」映射与字段挑选（境界名走 `REALMS` 单一来源）；
 * 展示与布局由 ui-kit 负责。
 */
import { observer } from 'mobx-react-lite';
import { Space } from 'antd';
import { HudBar, ThemeToggle, type HudItem } from '@idle-path/ui-kit';
import { REALMS } from '@idle-path/ionet-transport';
import { useRootStore } from '../app/root-context.js';
import { ConnectionStatus } from './ConnectionStatus.js';

function realmNameOf(realm: number | undefined): string {
  if (realm === undefined) return '—';
  return REALMS[realm - 1] ?? `第 ${realm} 境`;
}

export const GameHud = observer(function GameHud() {
  const root = useRootStore();
  const character = root.session.character;

  const items: HudItem[] = [
    {
      key: 'realm',
      label: '境界',
      value: realmNameOf(character?.realm),
      tooltip: '当前境界，决定可穿戴装备阶数与可进入秘境',
    },
    { key: 'spiritStones', label: '灵石', value: character?.spiritStones ?? 0 },
    { key: 'lingyun', label: '灵韵', value: character?.lingyun ?? 0, tooltip: '突破境界的核心消耗' },
    { key: 'jadeSlips', label: '玉简', value: character?.jadeSlips ?? 0, tooltip: '修习功法所需' },
  ];

  return (
    <HudBar
      items={items}
      loading={root.session.busy}
      extra={
        <Space align="center">
          <ConnectionStatus />
          <ThemeToggle value={root.theme.mode} onChange={(mode) => root.theme.setMode(mode)} />
        </Space>
      }
    />
  );
});
