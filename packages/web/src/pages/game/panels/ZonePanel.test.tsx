/**
 * ZonePanel（§22 重做）测试：**当前战斗卡片**。
 *
 * §22 已删除「挑战本层」按钮与 SettlementSummary 结算区块；秘境页面只列已突破的秘境。
 * 已突破秘境列表拆到同目录 `ZonePanel.list.test.tsx`，在线历练区在 `ZonePanel.online.test.tsx`。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ZONE_CMD, type ZoneProgressData, type ZoneView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { ZonePanel } from './ZonePanel.js';

function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
    id: 1,
    code: 'zone_1',
    name: '青云山脚',
    realm: 1,
    tierKind: 'training',
    orderIndex: 1,
    idleAllowed: true,
    unlockItemCode: null,
    unitCode: 'wolf_1',
    bossCode: null,
    basePower: 20,
    powerStep: 4,
    maxFloor: 10,
    lingyunBonusPerFloor: 2,
    current: true,
    progress: { floor: 4, bestFloor: 4, cleared: false, clears: 2 },
    ...overrides,
  };
}

function makeProgress(overrides: Partial<ZoneProgressData> = {}): ZoneProgressData {
  return {
    currentZone: { code: 'zone_1', name: '青云山脚', realm: 1 },
    floor: 4,
    bestFloor: 4,
    clears: 2,
    cleared: false,
    playerPower: 25,
    floorRequirement: 28,
    isBossFloor: false,
    lingyunBonus: 6,
    dropTierOffset: 0,
    extraDropDraws: 0,
    ...overrides,
  };
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.zone.zones = [makeZone()];
    harness.root.zone.playerPower = 25;
    harness.root.zone.progress = makeProgress();
    harness.root.zone.currentZone = 'zone_1';
    seedFn?.(harness.root);
  });
  return harness;
}

describe('ZonePanel · 当前战斗卡片', () => {
  it('展示 层/最高层/已通关轮数/门槛 四项关键数值', () => {
    const harness = setup();
    harness.render(<ZonePanel />);

    const stats = screen.getByTestId('zone-progress-stats');
    expect(stats).toHaveTextContent('当前层');
    expect(stats).toHaveTextContent('4');
    expect(stats).toHaveTextContent('最高层');
    expect(stats).toHaveTextContent('已通关');
    expect(stats).toHaveTextContent('2 轮');
    expect(stats).toHaveTextContent('本层门槛');
    expect(stats).toHaveTextContent('28');
  });

  it('战力不足给「差多少」', () => {
    const harness = setup();
    harness.render(<ZonePanel />);
    expect(screen.getByTestId('zone-power-compare')).toHaveTextContent('战力不足');
    expect(screen.getByTestId('zone-power-compare')).toHaveTextContent('差 3');
  });

  it('战力达标时显示「打得动」（§22 文案，非旧「可以挑战」）', () => {
    const harness = setup((root) => {
      root.zone.playerPower = 40;
      root.zone.progress = makeProgress({ playerPower: 40 });
    });
    harness.render(<ZonePanel />);

    expect(screen.getByTestId('zone-power-compare')).toHaveTextContent('打得动');
  });

  it('progress 为 null：只给指路 Alert，不渲染数值块与「离开秘境」', () => {
    const harness = setup((root) => {
      root.zone.progress = null;
      root.zone.currentZone = null;
    });
    harness.render(<ZonePanel />);

    const alert = screen.getByText(/当前没有进行中的战斗/);
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('秘境石台');
    expect(alert).toHaveTextContent('重复挑战');
    expect(screen.queryByTestId('zone-progress-stats')).toBeNull();
    expect(screen.queryByTestId('zone-leave')).toBeNull();
  });

  it('Boss 层/层灵韵/掉落档/额外判定 用标签提示，且不暴露协议字段', () => {
    const harness = setup((root) => {
      root.zone.progress = makeProgress({ isBossFloor: true, dropTierOffset: 2, extraDropDraws: 1 });
    });
    harness.render(<ZonePanel />);

    const tags = screen.getByTestId('zone-floor-tags');
    expect(tags).toHaveTextContent('Boss 层');
    expect(tags).toHaveTextContent('层灵韵 +6');
    expect(tags).toHaveTextContent('掉落档 +2');
    expect(tags).toHaveTextContent('额外掉落判定 +1');

    // 协议标识符不上屏（只做 key/排序）
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('zone_1');
    expect(text).not.toContain('wolf_1');
    expect(text).not.toContain('orderIndex');
  });

  it('点「离开秘境」发出 zone.leave（§22 新增的手动中断入口）', async () => {
    const harness = setup();
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-leave'));
    await waitFor(() =>
      expect(harness.requests.some((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.leave)).toBe(true),
    );
  });

  it('点「刷新秘境」发出 zone.zones 请求', async () => {
    const harness = setup();
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-refresh'));
    await waitFor(() =>
      expect(harness.requests.some((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.zones)).toBe(true),
    );
  });
});
