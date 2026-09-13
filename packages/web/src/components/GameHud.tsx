/**
 * GameHud —— 常驻信息条：只放「玩家每次上线都要看的量」。
 *
 * 条目依据 `10-玩法驱动的面板设计.md` §2，并做了一次减法：
 * - 保留：灵韵（唯一成长燃料）、玉简（修习消耗）、秘境·层（我在哪/下一步）、
 *   战力·本层门槛（现在能不能打）、待结算（放置游戏的「有收益没收」钩子）；
 * - **境界移到页头**（它是身份标识，与角色名/头衔同处一行更合理）；
 * - **去掉灵石**（§0：灵石目前无消费出口，放 HUD 属噪音）；
 * - **去掉 reqId/心跳/时钟偏移等实现细节**（移入 `ConnectionDiagnostics` 按需展开）。
 *
 * 数值统一走 `domain/format.ts` 与 ui-kit `formatDuration`，禁止裸浮点直出。
 */
import { observer } from 'mobx-react-lite';
import { Space } from 'antd';
import { HudBar, ThemeToggle, formatDuration, type HudItem } from '@idle-path/ui-kit';
import { useRootStore } from '../app/root-context.js';
import { formatCompactNumber, formatCount } from '../domain/format.js';
import { ConnectionDiagnostics } from './ConnectionDiagnostics.js';

export const GameHud = observer(function GameHud() {
  const root = useRootStore();
  const character = root.session.character;
  const progress = root.zone.progress;
  const idle = root.idle.status;

  const items: HudItem[] = [
    {
      key: 'lingyun',
      label: '灵韵',
      value: formatCompactNumber(character?.lingyun ?? 0),
      tooltip: '唯一成长燃料：突破境界与参悟功法都消耗它',
    },
    {
      key: 'jadeSlips',
      label: '玉简',
      value: formatCount(character?.jadeSlips ?? 0),
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
          ? formatCompactNumber(root.zone.playerPower)
          : `${formatCompactNumber(root.zone.playerPower)} / ${formatCompactNumber(progress.floorRequirement)}`,
      tooltip: '左为当前战力，右为本层门槛；低于门槛挑战必定失败',
    },
    {
      key: 'pending',
      label: '待结算',
      value: idle === null ? '—' : formatDuration(idle.pendingHours),
      tooltip: '离线收益累积时长（离线 12 小时封顶）',
    },
  ];

  return (
    <HudBar
      items={items}
      loading={root.session.busy}
      extra={
        <Space align="center" size={4}>
          <ConnectionDiagnostics />
          <ThemeToggle value={root.theme.mode} onChange={(mode) => root.theme.setMode(mode)} />
        </Space>
      }
    />
  );
});
