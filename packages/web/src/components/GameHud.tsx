/**
 * GameHud —— 常驻信息条容器：把「玩家每次上线都要看的量」接到 ui-kit `HudBar`。
 *
 * 条目依据 `ai-docs/frontend-solution-exploration/10-玩法驱动的面板设计.md` §2：
 * 境界（决定可穿 T 阶与秘境门槛）、灵韵（唯一成长燃料）、玉简（修习消耗）、
 * **当前秘境·层**（回答「我在哪、下一步做什么」）、**战力/本层门槛**（回答「现在能不能打」）、
 * **待结算时长**（放置游戏的「有收益没收」钩子）。
 *
 * 刻意**不**放灵石：文档 §0 指出灵石目前无消费出口（仅辨宝出售与任务奖励产出），
 * 放在 HUD 属于噪音；待交易接口落地再加（见 10 §0/§4）。
 *
 * 只做「store → props」映射与字段挑选（境界名走 `REALMS` 单一来源）；布局与展示由 ui-kit 负责。
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
  const progress = root.zone.progress;
  const idle = root.idle.status;

  const items: HudItem[] = [
    {
      key: 'realm',
      label: '境界',
      value: realmNameOf(character?.realm),
      tooltip: '决定可穿戴装备阶数与可进入秘境',
    },
    {
      key: 'lingyun',
      label: '灵韵',
      value: character?.lingyun ?? 0,
      tooltip: '唯一成长燃料：突破境界与参悟功法都消耗它',
    },
    {
      key: 'jadeSlips',
      label: '玉简',
      value: character?.jadeSlips ?? 0,
      tooltip: '修习功法消耗',
    },
    {
      key: 'zone',
      label: '秘境',
      value: progress === null ? '未进入' : `${progress.currentZone.name} · 第 ${progress.floor} 层`,
      tooltip: '当前秘境与层数；挂机结算的就是这里的单位',
    },
    {
      key: 'power',
      label: '战力',
      value:
        progress === null
          ? String(root.zone.playerPower)
          : `${root.zone.playerPower} / ${progress.floorRequirement}`,
      tooltip: '左为当前战力，右为本层门槛；低于门槛挑战必定失败',
    },
    {
      key: 'pending',
      label: '待结算',
      value: idle === null ? '—' : `${idle.pendingHours} 小时`,
      tooltip: '离线收益累积时长（离线 12 小时封顶）',
    },
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
