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
  it('展示境界名（REALMS 边界：第 14 境）与资源', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.character = character;
    });
    harness.render(<GameHud />);

    expect(screen.getByTestId('hud-item-realm')).toHaveTextContent('合道'); // REALMS[13]（realm=14）
    expect(screen.getByTestId('hud-item-spiritStones')).toHaveTextContent('100');
    expect(screen.getByTestId('hud-item-jadeSlips')).toHaveTextContent('1');
  });

  it('无角色时境界显示占位、资源为 0', () => {
    const harness = createPanelHarness();
    harness.render(<GameHud />);
    expect(screen.getByTestId('hud-item-realm')).toHaveTextContent('—');
    expect(screen.getByTestId('hud-item-spiritStones')).toHaveTextContent('0');
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
