/**
 * ZonePanel（新版·玩法驱动样板）测试。
 * 重点断言「玩法信息是否真的呈现」，以及「协议字段是否真的没上屏」。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ZONE_CMD, type ZoneChallengeData, type ZoneProgressData, type ZoneView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { ZonePanel } from './ZonePanel.js';

function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
    id: 1,
    code: 'zone_1',
    name: '青云山脚',
    chapter: 1,
    orderIndex: 1,
    minRealm: 1,
    requirePrevBestFloor: 0,
    unlocked: true,
    unlockedReason: 'ok',
    prevZone: null,
    prevBestFloor: 0,
    current: true,
    unitCode: 'wolf_1',
    bossCode: null,
    basePower: 20,
    powerStep: 4,
    maxFloor: 10,
    lingyunBonusPerFloor: 2,
    progress: { bestFloor: 4, branch: 1, cleared: false, unlocked: true },
    ...overrides,
  } as ZoneView;
}

function makeProgress(overrides: Partial<ZoneProgressData> = {}): ZoneProgressData {
  return {
    currentZone: { code: 'zone_1', name: '青云山脚', chapter: 1 },
    floor: 4,
    bestFloor: 4,
    cleared: false,
    unlocked: true,
    playerPower: 25,
    floorRequirement: 28,
    canChallenge: false,
    isBossFloor: false,
    encounterUnit: 'wolf_1',
    lingyunBonus: 6,
    dropTierOffset: 0,
    extraDropDraws: 0,
    ...overrides,
  } as ZoneProgressData;
}

function makeChallenge(overrides: Partial<ZoneChallengeData> = {}): ZoneChallengeData {
  return {
    zone: { code: 'zone_1', name: '青云山脚' },
    floor: 4,
    nextFloor: 5,
    bestFloor: 5,
    cleared: false,
    playerPower: 40,
    floorRequirement: 28,
    isBossFloor: false,
    dropTierOffset: 0,
    extraDropDraws: 0,
    rewards: {
      lingyunGained: 12,
      lingyunBonus: 6,
      lingyunTotal: 120,
      items: [],
      kept: 2,
      salvaged: { count: 3, lingyun: 9 },
      sold: { count: 1, spiritStones: 15 },
      blockedByTier: 1,
      currencies: { chaos: 2 },
      essences: { essence_fire: 1 },
    },
    ...overrides,
  } as ZoneChallengeData;
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.session.character = {
      id: 1,
      userId: 1,
      nickname: '验收道友',
      gender: 'male',
      title: '散修',
      spiritStones: 0,
      silver: 0,
      realm: 1,
      lingyun: 0,
      jadeSlips: 0,
    };
    harness.root.zone.zones = [makeZone()];
    harness.root.zone.playerPower = 25;
    harness.root.zone.progress = makeProgress();
    harness.root.zone.currentZone = 'zone_1';
    seedFn?.(harness.root);
  });
  return harness;
}

describe('ZonePanel · 当前秘境与战力门槛（玩法信息）', () => {
  it('展示 层/最高层/战力/门槛 四项关键数值', () => {
    const harness = setup();
    harness.render(<ZonePanel />);

    const stats = screen.getByTestId('zone-progress-stats');
    expect(stats).toHaveTextContent('当前层');
    expect(stats).toHaveTextContent('4');
    expect(stats).toHaveTextContent('最高层');
    expect(stats).toHaveTextContent('战力');
    expect(stats).toHaveTextContent('25');
    expect(stats).toHaveTextContent('本层门槛');
    expect(stats).toHaveTextContent('28');
  });

  it('战力不足时给出「差多少」而不是只报错', () => {
    const harness = setup();
    harness.render(<ZonePanel />);

    const compare = screen.getByTestId('zone-power-compare');
    expect(compare).toHaveTextContent('战力不足');
    expect(compare).toHaveTextContent('差 3');
  });

  it('战力达标时显示可以挑战', () => {
    const harness = setup((root) => {
      root.zone.playerPower = 40;
      root.zone.progress = makeProgress({ playerPower: 40, canChallenge: true });
    });
    harness.render(<ZonePanel />);

    expect(screen.getByTestId('zone-power-compare')).toHaveTextContent('可以挑战');
  });

  it('战力不足时按钮禁用并在悬浮提示里说明原因', async () => {
    const harness = setup();
    harness.render(<ZonePanel />);

    const button = screen.getByTestId('zone-challenge');
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(await screen.findByText(/还差 3/)).toBeInTheDocument();
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
});

describe('ZonePanel · 挑战与结算', () => {
  it('达标时经确认后发出 zone.challenge', async () => {
    const harness = setup((root) => {
      root.zone.playerPower = 40;
      root.zone.progress = makeProgress({ playerPower: 40, canChallenge: true });
    });
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-challenge'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定|确 定|OK/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.challenge).length,
      ).toBeGreaterThan(0),
    );
  });

  it('有挑战结果时展示结算摘要（灵韵/保留/分解/出售/卡阶）', () => {
    const harness = setup((root) => {
      root.zone.lastChallenge = makeChallenge();
    });
    harness.render(<ZonePanel />);

    const settlement = screen.getByTestId('zone-settlement');
    expect(settlement).toHaveTextContent('第 4 层 → 第 5 层');
    expect(settlement).toHaveTextContent('120'); // lingyunTotal
    expect(settlement).toHaveTextContent('2'); // kept
    expect(settlement).toHaveTextContent('卡阶');
  });

  it('无挑战结果时不渲染结算卡', () => {
    const harness = setup();
    harness.render(<ZonePanel />);
    expect(screen.queryByTestId('zone-settlement')).toBeNull();
  });

  it('点击刷新发出 zone.zones 请求', async () => {
    const harness = setup();
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-refresh'));
    await waitFor(() =>
      expect(harness.requests.some((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.zones)).toBe(true),
    );
  });
});

describe('ZonePanel · 秘境图鉴与解锁', () => {
  it('已解锁且非当前的秘境提供「进入」，确认后发出 zone.enter', async () => {
    const harness = setup((root) => {
      root.zone.zones = [
        makeZone(),
        makeZone({ id: 2, code: 'zone_2', name: '落霞谷', chapter: 1, current: false }),
      ];
    });
    harness.render(<ZonePanel />);
    await harness.connect();

    const enter = screen.getByTestId('zone-enter-zone_2');
    await userEvent.click(enter);
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定|确 定|OK/ }));

    await waitFor(() =>
      expect(harness.requests.filter((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.enter).length).toBeGreaterThan(0),
    );
  });

  it('境界不足的秘境显示门槛提示且没有进入入口', () => {
    const harness = setup((root) => {
      root.zone.zones = [
        makeZone(),
        makeZone({
          id: 3,
          code: 'zone_3',
          name: '寒潭',
          chapter: 2,
          unlocked: false,
          unlockedReason: 'realm',
          minRealm: 5,
          current: false,
        }),
      ];
    });
    harness.render(<ZonePanel />);

    const locked = screen.getByTestId('zone-locked-zone_3');
    expect(locked).toHaveTextContent('境界不足');
    expect(locked).toHaveTextContent('5');
    expect(screen.queryByTestId('zone-enter-zone_3')).toBeNull();
  });

  it('前置未满足的秘境显示前置条件文案', () => {
    const harness = setup((root) => {
      root.zone.zones = [
        makeZone(),
        makeZone({
          id: 4,
          code: 'zone_4',
          name: '古洞',
          chapter: 2,
          unlocked: false,
          unlockedReason: 'prev',
          prevZone: 'zone_1',
          prevBestFloor: 3,
          requirePrevBestFloor: 5,
          current: false,
        }),
      ];
    });
    harness.render(<ZonePanel />);

    const locked = screen.getByTestId('zone-locked-zone_4');
    expect(locked).toHaveTextContent('需先推进');
    expect(locked).toHaveTextContent('5');
    expect(locked).toHaveTextContent('3');
  });

  it('秘境数量与图鉴卡片渲染', () => {
    const harness = setup();
    harness.render(<ZonePanel />);

    expect(screen.getByTestId('zone-total')).toHaveTextContent('共 1 处');
    expect(within(screen.getByTestId('zone-list')).getByTestId('zone-card-zone_1')).toBeInTheDocument();
    // 当前秘境不再出现「进入」，而以「当前」标签表示
    expect(screen.queryByTestId('zone-enter-zone_1')).toBeNull();
  });

  it('空态：既无当前秘境也无图鉴时给出空态文案', () => {
    const harness = createPanelHarness();
    harness.render(<ZonePanel />);
    expect(screen.getByText('暂无可用秘境')).toBeInTheDocument();
  });
});
