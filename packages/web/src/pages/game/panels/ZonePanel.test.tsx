/**
 * ZonePanel 测试：渲染 / 空态 / 三态 / 交互真发请求 / 边界。
 * 交互用例必须先 `await harness.connect()`；seed 一律在 `harness.seed()` 内。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ZONE_CMD } from '@idle-path/ionet-transport';
import type { ZoneChallengeData, ZoneProgressData, ZoneView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { ZonePanel } from './ZonePanel.js';

function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
    id: 1, code: 'zone_a', name: '青云秘境', chapter: 1, orderIndex: 1, minRealm: 1,
    requirePrevBestFloor: 0, unlocked: true, unlockedReason: 'ok', prevZone: null,
    prevBestFloor: 0, current: false, unitCode: 'u1', bossCode: null, basePower: 100,
    powerStep: 10, maxFloor: 10, lingyunBonusPerFloor: 1,
    progress: { floor: 1, bestFloor: 3, cleared: false },
    ...overrides,
  };
}

const PROGRESS: ZoneProgressData = {
  currentZone: { code: 'zone_a', name: '青云秘境', chapter: 1 },
  floor: 3, bestFloor: 3, cleared: false, unlocked: true, playerPower: 500,
  floorRequirement: 300, canChallenge: true, isBossFloor: false, encounterUnit: 'u1',
  lingyunBonus: 1, dropTierOffset: 0, extraDropDraws: 0,
};

const CHALLENGE: ZoneChallengeData = {
  zone: { code: 'zone_a', name: '青云秘境' }, floor: 3, nextFloor: 4, bestFloor: 4,
  cleared: false, playerPower: 500, floorRequirement: 300, isBossFloor: false,
  dropTierOffset: 0, extraDropDraws: 0,
  rewards: {
    lingyunGained: 12, lingyunBonus: 2, lingyunTotal: 14, items: [], kept: 1,
    salvaged: { count: 0, lingyun: 0 }, sold: { count: 0, spiritStones: 0 },
    blockedByTier: 0, currencies: {}, essences: {},
  },
};

describe('ZonePanel', () => {
  it('渲染秘境列表与概览：副标题 / 进度列 / 解锁列 / 空 lastChallenge', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.zones = [makeZone()];
      harness.root.zone.playerPower = 500;
      harness.root.zone.progress = PROGRESS;
    });
    harness.render(<ZonePanel />);

    expect(screen.getByText('青云秘境 · 第 3 层')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();
    expect(screen.getByText('最低境界')).toBeInTheDocument();
    expect(screen.getByText('是')).toBeInTheDocument();
    expect(screen.getByTestId('zone-enter-zone_a')).toBeEnabled();
    expect(screen.getByTestId('zone-last-challenge')).toHaveTextContent('尚未挑战');
  });

  it('空列表 + progress=null：显示空态且不崩', () => {
    const harness = createPanelHarness();
    harness.render(<ZonePanel />);

    expect(screen.getByText('还没有可去的秘境')).toBeInTheDocument();
    expect(screen.getByText('尚未进入秘境')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.loading = true;
    });
    const view = harness.render(<ZonePanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.zone.loading = false;
      harness.root.zone.error = '秘境加载失败';
    });
    harness.render(<ZonePanel />);
    expect(screen.getByText('秘境加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('点击「进入」并确认后经 WS 发出 zone.enter（zoneCode 正确）', async () => {
    const harness = createPanelHarness({
      handler: (request) =>
        request.cmd === ZONE_CMD.cmd && request.subCmd === ZONE_CMD.enter
          ? {
              data: {
                success: true,
                message: 'ok',
                data: { currentZone: { code: 'zone_a', name: '青云秘境', chapter: 1 }, floor: 1, bestFloor: 1 },
              },
            }
          : null,
    });
    harness.seed(() => {
      harness.root.zone.zones = [makeZone()];
    });
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-enter-zone_a'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.enter);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ zoneCode: 'zone_a' });
    });
  });

  it('点击「挑战当前层」并确认后经 WS 发出 zone.challenge', async () => {
    const harness = createPanelHarness();
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-challenge'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.challenge);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({});
    });
  });

  it('边界：unlocked=false 禁用进入；progress=null 不崩；lastChallenge 明细正确', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.zones = [makeZone({ code: 'zone_locked', name: '锁妖塔', unlocked: false })];
      harness.root.zone.progress = null;
      harness.root.zone.lastChallenge = CHALLENGE;
    });
    harness.render(<ZonePanel />);

    expect(screen.getByTestId('zone-enter-zone_locked')).toBeDisabled();
    expect(screen.getByText('尚未进入秘境')).toBeInTheDocument();
    const box = screen.getByTestId('zone-last-challenge');
    expect(within(box).getByText('3 → 4')).toBeInTheDocument();
    expect(within(box).getByText('12')).toBeInTheDocument();
  });
});
