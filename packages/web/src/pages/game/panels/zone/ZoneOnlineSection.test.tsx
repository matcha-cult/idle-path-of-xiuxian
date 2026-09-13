/**
 * `ZoneOnlineSection` 单测（P3.0 T6）：进度 / 层数 / 卡层提示 / 解锁引导 / 事件标签 / 边界。
 *
 * 组件是纯展示：不读 store、不发请求（`onRefresh` 只是回调）。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ZoneOnlineData } from '@idle-path/ionet-transport';
import { ZoneOnlineSection } from './ZoneOnlineSection.js';

function frame(overrides: Partial<ZoneOnlineData> = {}): ZoneOnlineData {
  return {
    online: true,
    exploring: true,
    reason: 'ok',
    zone: { code: 'zone_houshan', name: '后山历练峰' },
    nodeCode: 'qy_peak_xunlian',
    nodeName: '第八峰·历练',
    floor: 2,
    maxFloor: 3,
    bestFloor: 1,
    cleared: false,
    isBossFloor: false,
    playerPower: 100,
    floorRequirement: 87,
    floorKills: 12,
    killsPerFloor: 30,
    stuck: false,
    shortfall: 0,
    idleUnlocked: false,
    kills: 0,
    lingyunGained: 0,
    events: [],
    tickMs: 1000,
    pushEveryMs: 3000,
    ...overrides,
  };
}

function setup(data: ZoneOnlineData | null, onRefresh?: () => void) {
  render(<ZoneOnlineSection frame={data} onRefresh={onRefresh} />);
}

describe('ZoneOnlineSection · 正常态', () => {
  it('层数 / 本层击杀 / 战力 / 门槛都上屏，进度条百分比正确', () => {
    setup(frame());
    const stats = screen.getByTestId('zone-online-stats');
    expect(stats).toHaveTextContent('第 2 / 3 层');
    expect(stats).toHaveTextContent('12 / 30');
    expect(stats).toHaveTextContent('100');
    expect(stats).toHaveTextContent('87');
    expect(screen.getByTestId('zone-online-progress')).toHaveTextContent('本层进度 40%');
    expect(screen.getByTestId('zone-online-compare')).toHaveTextContent('打得动');
  });

  it('副标题说明服务端节奏（不是客户端本地推进）', () => {
    setup(frame());
    expect(document.body).toHaveTextContent('正在历练 · 每 1 秒结算一次');
    expect(screen.getByTestId('zone-online-rhythm')).toHaveTextContent('每 3 秒推送');
  });

  it('Boss 层 / 已通关 / 已解锁标签按帧渲染', () => {
    setup(frame({ isBossFloor: true, cleared: true, idleUnlocked: true }));
    const tags = screen.getByTestId('zone-online-tags');
    expect(tags).toHaveTextContent('Boss 层');
    expect(tags).toHaveTextContent('已通关');
    expect(tags).toHaveTextContent('离线挂机已解锁');
  });

  it('推送帧的事件标签与产出摘要上屏；读接口（kills=0）不显示摘要', () => {
    setup(frame({ events: ['floor_up', 'boss_floor'], kills: 4, lingyunGained: 12 }));
    const tags = screen.getByTestId('zone-online-tags');
    expect(tags).toHaveTextContent('涨层');
    expect(tags).toHaveTextContent('进入 Boss 层');
    expect(tags).toHaveTextContent('本次 +4 击杀 · +12 灵韵');
  });
});

describe('ZoneOnlineSection · 卡层与解锁引导', () => {
  it('卡层：给出「还差 N」且进度条转 exception', () => {
    setup(frame({ playerPower: 80, floorRequirement: 87, stuck: true, shortfall: 7, floorKills: 5 }));
    expect(screen.getByTestId('zone-online-stuck')).toHaveTextContent('战力不足，还差 7');
    expect(screen.getByTestId('zone-online-compare')).toHaveTextContent('卡层');
    expect(screen.getByTestId('zone-online-progress')).toHaveTextContent('本层进度 17%');
  });

  it('不卡层时不渲染卡层提示', () => {
    setup(frame({ stuck: false }));
    expect(screen.queryByTestId('zone-online-stuck')).toBeNull();
  });

  it('未解锁时不渲染挂机引导；解锁后给出引导文案', () => {
    setup(frame());
    expect(screen.queryByTestId('zone-online-idle-hint')).toBeNull();
    setup(frame({ idleUnlocked: true }));
    expect(screen.getAllByTestId('zone-online-idle-hint')[0]).toHaveTextContent('已解锁离线挂机');
  });
});

describe('ZoneOnlineSection · 边界', () => {
  it('frame=null：不崩，给出占位文案与 0 值', () => {
    setup(null);
    expect(document.body).toHaveTextContent('尚未读取历练实况');
    expect(screen.getByTestId('zone-online-stats')).toHaveTextContent('—');
    expect(screen.getByTestId('zone-online-progress')).toHaveTextContent('本层进度 0%');
  });

  it('离线（no_session）/ 切后台（hidden）：状态文案体现暂停', () => {
    setup(frame({ online: false, exploring: false, reason: 'no_session', floor: 0, floorKills: 0 }));
    expect(document.body).toHaveTextContent('连接断开时服务端不会推进');
    setup(frame({ online: false, exploring: false, reason: 'hidden' }));
    expect(document.body).toHaveTextContent('后台');
  });

  it('未进入秘境 / 不在秘境峰：给出可操作的解释', () => {
    setup(frame({ online: true, exploring: false, reason: 'no_realm', zone: null }));
    expect(document.body).toHaveTextContent('尚未进入秘境');
    setup(frame({ online: true, exploring: false, reason: 'not_map_realm' }));
    expect(document.body).toHaveTextContent('不是地图上的历练秘境峰');
  });

  it('killsPerFloor=0（配置漂移）：进度 0%，不出现 NaN', () => {
    setup(frame({ killsPerFloor: 0, floorKills: 5 }));
    expect(screen.getByTestId('zone-online-progress')).toHaveTextContent('本层进度 0%');
  });

  it('未知事件不上屏（不回显协议原文）', () => {
    setup(frame({ events: ['mystery_event' as ZoneOnlineData['events'][number]] }));
    expect(screen.getByTestId('zone-online-tags')).not.toHaveTextContent('mystery_event');
  });

  it('maxFloor=1（无普通层）：显示「第 1 / 1 层」', () => {
    setup(frame({ floor: 1, maxFloor: 1, isBossFloor: false }));
    expect(screen.getByTestId('zone-online-stats')).toHaveTextContent('第 1 / 1 层');
  });
});

describe('ZoneOnlineSection · 刷新', () => {
  it('点「刷新实况」触发回调（组件本身不发请求）', async () => {
    const onRefresh = vi.fn();
    setup(frame(), onRefresh);
    await userEvent.click(screen.getByTestId('zone-online-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('不传 onRefresh 时不渲染刷新按钮', () => {
    setup(frame());
    expect(screen.queryByTestId('zone-online-refresh')).toBeNull();
  });
});
