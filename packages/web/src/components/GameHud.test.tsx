/**
 * GameHud：字段挑选、境界名映射、主题切换、连接状态挂载。
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Character } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../test/helpers/panel-harness.js';
import { GameHud } from './GameHud.js';

const character: Character = {
  id: 1,
  userId: 1,
  nickname: '无名',
  gender: 'male',
  title: '散修',
  spiritStones: 100,
  silver: 0,
  realm: 14,
  lingyun: 9,
  jadeSlips: 1,
};

describe('GameHud', () => {
  it('展示境界名（REALMS 边界：第 14 境）与灵韵/玉简', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.character = character;
    });
    harness.render(<GameHud />);

    expect(screen.getByTestId('hud-item-realm')).toHaveTextContent('合道'); // REALMS[13]（realm=14）
    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('9');
    expect(screen.getByTestId('hud-item-jadeSlips')).toHaveTextContent('1');
  });

  it('未进入秘境时「秘境」显示未进入，战力只显示当前值', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.playerPower = 120;
    });
    harness.render(<GameHud />);

    expect(screen.getByTestId('hud-item-zone')).toHaveTextContent('未进入');
    expect(screen.getByTestId('hud-item-power')).toHaveTextContent('120');
  });

  it('进入秘境后显示「秘境 · 第 N 层」与「战力 / 本层门槛」', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.playerPower = 120;
      harness.root.zone.progress = {
        currentZone: { code: 'zone_1', name: '落霞谷', chapter: 1 },
        floor: 3,
        bestFloor: 3,
        cleared: false,
        unlocked: true,
        playerPower: 120,
        floorRequirement: 150,
        canChallenge: false,
        isBossFloor: false,
        encounterUnit: 'wolf',
        lingyunBonus: 10,
        dropTierOffset: 0,
        extraDropDraws: 0,
      };
    });
    harness.render(<GameHud />);

    expect(screen.getByTestId('hud-item-zone')).toHaveTextContent('落霞谷 · 第 3 层');
    expect(screen.getByTestId('hud-item-power')).toHaveTextContent('120 / 150');
  });

  it('待结算时长：无 idle.status 显示占位', () => {
    const harness = createPanelHarness();
    harness.render(<GameHud />);
    expect(screen.getByTestId('hud-item-pending')).toHaveTextContent('—');
  });

  it('待结算时长：有 idle.status 时显示小时数', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.idle.status = {
        realm: 1,
        lastSettleAt: '2026-09-13T00:00:00.000Z',
        pendingHours: 4,
        effectiveHours: 3.6,
        estimatedKills: 40,
        estimatedLingyun: 80,
        dailyItemsProduced: 0,
        dailyItemCap: 200,
        config: { roundsPerHour: 60, efficiencyPct: 90, maxOfflineHours: 12 },
      };
    });
    harness.render(<GameHud />);
    expect(screen.getByTestId('hud-item-pending')).toHaveTextContent('4 小时');
  });

  it('无角色时境界显示占位、灵韵为 0', () => {
    const harness = createPanelHarness();
    harness.render(<GameHud />);
    expect(screen.getByTestId('hud-item-realm')).toHaveTextContent('—');
    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('0');
  });

  it('空角色对象（null）不崩', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.character = null;
    });
    expect(() => harness.render(<GameHud />)).not.toThrow();
  });

  it('内嵌连接状态与主题切换', async () => {
    const harness = createPanelHarness();
    harness.render(<GameHud />);

    expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('theme-toggle'));
    expect(harness.root.theme.mode).toBe('dark');
    await userEvent.click(screen.getByTestId('theme-toggle'));
    expect(harness.root.theme.mode).toBe('light');
  });

  it('会话忙碌时 HUD 显示骨架而非旧值', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.character = character;
      harness.root.session.busy = true;
    });
    const { container } = harness.render(<GameHud />);
    expect(screen.queryByTestId('hud-item-realm')).toBeNull();
    expect(container.querySelectorAll('.ant-skeleton').length).toBeGreaterThan(0);
  });
});
