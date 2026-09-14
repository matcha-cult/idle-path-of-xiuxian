/**
 * GameHud：玩法驱动条目、数值格式化（禁止裸浮点）、连接诊断入口、主题切换。
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
  lingyun: 12345,
  jadeSlips: 2,
};

describe('GameHud', () => {
  it('只保留 5 个玩法驱动条目（境界已移入页头、灵石无消费出口故不展示）', () => {
    const harness = createPanelHarness();
    harness.render(<GameHud />);
    for (const key of ['lingyun', 'jadeSlips', 'zone', 'power', 'pending']) {
      expect(screen.getByTestId(`hud-item-${key}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('hud-item-realm')).toBeNull();
    expect(screen.queryByTestId('hud-item-spiritStones')).toBeNull();
  });

  it('大数值按万压缩（12345 → 1.2 万），小数值原样', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.character = character;
    });
    harness.render(<GameHud />);

    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('1.2 万');
    expect(screen.getByTestId('hud-item-jadeSlips')).toHaveTextContent('2');
  });

  it('待结算时长用人类可读格式（裸浮点回归：2.0210366666666667 → 2 小时 1 分）', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.idle.status = {
        realm: 3,
        lastSettleAt: '2026-09-13T00:00:00.000Z',
        pendingHours: 2.0210366666666667,
        effectiveHours: 1.8,
        estimatedKills: 20,
        estimatedLingyun: 40,
        dailyItemsProduced: 0,
        dailyItemCap: 200,
        config: { roundsPerHour: 60, efficiencyPct: 90, maxOfflineHours: 12 },
      };
    });
    harness.render(<GameHud />);

    expect(screen.getByTestId('hud-item-pending')).toHaveTextContent('2 小时 1 分');
    expect(screen.getByTestId('hud-item-pending')).not.toHaveTextContent('2.021');
  });

  it('未进入秘境时显示未进入；进入后显示「秘境 · 第 N 层」与「战力 / 门槛」', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.playerPower = 120;
    });
    harness.render(<GameHud />);
    expect(screen.getByTestId('hud-item-zone')).toHaveTextContent('未进入');
    expect(screen.getByTestId('hud-item-power')).toHaveTextContent('120');
  });

  it('进入秘境后显示层数与门槛', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.zone.playerPower = 12000;
      harness.root.zone.progress = {
        // §22：currentZone 带 realm、进度带 clears（旧 chapter/unlocked/canChallenge 已删）
        currentZone: { code: 'zone_1', name: '落霞谷', realm: 2 },
        floor: 3,
        bestFloor: 3,
        clears: 1,
        cleared: false,
        playerPower: 12000,
        floorRequirement: 15000,
        isBossFloor: false,
        lingyunBonus: 10,
        dropTierOffset: 0,
        extraDropDraws: 0,
      };
    });
    harness.render(<GameHud />);
    expect(screen.getByTestId('hud-item-zone')).toHaveTextContent('落霞谷 · 第 3 层');
    expect(screen.getByTestId('hud-item-power')).toHaveTextContent('1.2 万 / 1.5 万');
  });

  it('无角色/无挂机数据时不崩，显示占位', () => {
    const harness = createPanelHarness();
    harness.render(<GameHud />);
    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('0');
    expect(screen.getByTestId('hud-item-pending')).toHaveTextContent('—');
  });

  it('会话忙碌时取值位显示骨架', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.character = character;
      harness.root.session.busy = true;
    });
    const { container } = harness.render(<GameHud />);
    expect(screen.queryByTestId('hud-item-lingyun')).toBeNull();
    expect(container.querySelectorAll('.ant-skeleton').length).toBeGreaterThan(0);
  });

  it('内嵌连接诊断入口（常驻只显示徽标）与一键换肤', async () => {
    const harness = createPanelHarness();
    harness.render(<GameHud />);

    expect(screen.getByTestId('connection-badge')).toBeInTheDocument();
    expect(screen.queryByText(/reqId/)).toBeNull();

    await userEvent.click(screen.getByTestId('theme-toggle'));
    expect(harness.root.theme.mode).toBe('dark');
    await userEvent.click(screen.getByTestId('theme-toggle'));
    expect(harness.root.theme.mode).toBe('light');
  });
});
