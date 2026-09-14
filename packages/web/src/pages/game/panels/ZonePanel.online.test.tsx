/**
 * ZonePanel · 在线历练区（P3.0 T6；§22 修订）。
 *
 * 从 `ZonePanel.test.tsx` 拆出（单文件规模）：这里只覆盖在线实况区块，
 * 当前战斗卡片与已突破秘境列表留在主文件。
 * §22：`idle_unlocked` → `realm_unlocked`；解锁引导 testid 变成 `zone-online-unlock-hint`。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ZONE_CMD, type ZoneOnlineData } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { ZonePanel } from './ZonePanel.js';

function makeOnline(overrides: Partial<ZoneOnlineData> = {}): ZoneOnlineData {
  return {
    online: true,
    exploring: true,
    reason: 'ok',
    zone: { code: 'zone_r4', name: '后山兽潮', realm: 4 },
    floor: 1,
    maxFloor: 3,
    bestFloor: 0,
    cleared: false,
    clears: 0,
    isBossFloor: false,
    playerPower: 80,
    floorRequirement: 75,
    floorKills: 12,
    killsPerFloor: 30,
    stuck: false,
    shortfall: 0,
    kills: 0,
    lingyunGained: 0,
    events: [],
    tickMs: 1000,
    pushEveryMs: 3000,
    ...overrides,
  };
}

describe('ZonePanel · 在线历练区（P3.0 T6）', () => {
  it('面板总是渲染在线历练区；无实况时给占位文案（不崩）', () => {
    const harness = createPanelHarness();
    harness.render(<ZonePanel />);
    expect(screen.getByTestId('zone-online-stats')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('尚未读取历练实况');
  });

  it('有实况时展示层数 / 击杀进度 / 卡层提示', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.online = makeOnline({ floor: 2, bestFloor: 1, floorKills: 30, stuck: true, shortfall: 7 });
    });
    harness.render(<ZonePanel />);
    const stats = screen.getByTestId('zone-online-stats');
    expect(stats).toHaveTextContent('第 2 / 3 层');
    expect(stats).toHaveTextContent('30 / 30');
    expect(screen.getByTestId('zone-online-progress')).toHaveTextContent('本层进度 100%');
    expect(screen.getByTestId('zone-online-stuck')).toHaveTextContent('还差 7');
  });

  it('突破（打满一轮自动退出）后：标签与引导文案都在线历练区里', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.online = makeOnline({
        reason: 'no_battle',
        exploring: false,
        cleared: true,
        clears: 1,
        events: ['boss_defeated', 'realm_unlocked'],
      });
    });
    harness.render(<ZonePanel />);
    expect(within(screen.getByTestId('zone-online-tags')).getByText('已突破')).toBeInTheDocument();
    expect(screen.getByTestId('zone-online-unlock-hint')).toHaveTextContent('已突破');
    // 旧的挂机解锁提示区块已随 §22 更名
    expect(screen.queryByTestId('zone-online-idle-hint')).toBeNull();
  });

  it('点「刷新实况」真的发出 (100,5)（且不复用列表接口）', async () => {
    const harness = createPanelHarness({
      handler: async (request) => {
        if (request.cmd !== ZONE_CMD.cmd) return null;
        if (request.subCmd === ZONE_CMD.online) {
          return { data: { success: true, message: 'ok', data: makeOnline({ floorKills: 7 }) } };
        }
        return null;
      },
    });
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-online-refresh'));
    await waitFor(() =>
      expect(
        harness.requests.some((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.online),
      ).toBe(true),
    );
    await waitFor(() => expect(harness.root.zone.online?.floorKills).toBe(7));
  });
});
