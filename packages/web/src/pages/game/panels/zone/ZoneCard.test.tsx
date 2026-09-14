/**
 * ZoneCard 测试（§23 ① G4/G5）：重复挑战入口 + 「设为挂机点」快捷入口的全部状态。
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ZoneView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../../test/helpers/panel-harness.js';
import { ZoneCard } from './ZoneCard.js';

function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
    id: 4,
    code: 'zone_r4',
    name: '落霞谷',
    realm: 4,
    tierKind: 'training',
    orderIndex: 4,
    idleAllowed: true,
    unlockItemCode: null,
    unitCode: 'u_r4',
    bossCode: 'u_r4_boss',
    basePower: 75,
    powerStep: 12,
    maxFloor: 3,
    lingyunBonusPerFloor: 8,
    current: false,
    progress: { floor: 3, bestFloor: 3, cleared: true, clears: 2 },
    ...overrides,
  };
}

function setup(props: Partial<Parameters<typeof ZoneCard>[0]> = {}) {
  const onEnter = vi.fn();
  const onSetIdleTarget = vi.fn();
  const harness = createPanelHarness();
  harness.render(
    <ZoneCard zone={makeZone()} current={false} onEnter={onEnter} onSetIdleTarget={onSetIdleTarget} {...props} />,
  );
  return { onEnter, onSetIdleTarget };
}

describe('ZoneCard · 基础展示', () => {
  it('展示名称 / 境界 / 类别 / 进度 / 通关轮数', () => {
    setup();
    const card = screen.getByTestId('zone-card-zone_r4');
    expect(card).toHaveTextContent('落霞谷');
    expect(card).toHaveTextContent('第 4 境');
    expect(card).toHaveTextContent('历练秘境');
    expect(card).toHaveTextContent('进度 3 / 3 层');
    expect(card).toHaveTextContent('已通关 2 轮');
  });

  it('边界：progress 缺失时进度按 0 渲染、不崩', () => {
    setup({ zone: makeZone({ progress: undefined as never }) });
    expect(screen.getByTestId('zone-card-zone_r4')).toHaveTextContent('进度 0 / 3 层');
  });

  it('当前战斗中的秘境不给「重复挑战」', () => {
    setup({ current: true });
    expect(screen.queryByTestId('zone-enter-zone_r4')).toBeNull();
    expect(screen.getByTestId('zone-card-zone_r4')).toHaveTextContent('已在此秘境战斗');
  });
});

describe('ZoneCard · 设为挂机点（§23）', () => {
  it('可挂机：按钮可用，点击回传 code', async () => {
    const { onSetIdleTarget } = setup();
    await userEvent.click(screen.getByTestId('zone-idle-set-zone_r4'));
    expect(onSetIdleTarget).toHaveBeenCalledWith('zone_r4');
  });

  it('特殊秘境（idleAllowed=false）：按钮禁用并带说明（前端不给必败入口）', () => {
    setup({ zone: makeZone({ tierKind: 'special', idleAllowed: false }) });
    expect(screen.queryByTestId('zone-idle-set-zone_r4')).toBeNull();
    expect(screen.getByTestId('zone-idle-disabled-zone_r4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /设\s*为\s*挂\s*机\s*点/ })).toBeDisabled();
  });

  it('已是挂机点：显示 Tag，不再显示设置按钮', () => {
    setup({ isIdleTarget: true });
    expect(screen.getByTestId('zone-idle-tag-zone_r4')).toHaveTextContent('挂机点');
    expect(screen.queryByTestId('zone-idle-set-zone_r4')).toBeNull();
  });

  it('正在设置中：按钮 loading', () => {
    setup({ idleBusy: true });
    expect(screen.getByTestId('zone-idle-set-zone_r4').className).toContain('ant-btn-loading');
  });

  it('边界：不传 onSetIdleTarget 时不渲染挂机入口（组件可插拔）', () => {
    const harness = createPanelHarness();
    harness.render(<ZoneCard zone={makeZone()} current={false} onEnter={vi.fn()} />);
    expect(screen.queryByTestId('zone-idle-set-zone_r4')).toBeNull();
    expect(screen.queryByTestId('zone-idle-disabled-zone_r4')).toBeNull();
    expect(screen.queryByTestId('zone-idle-tag-zone_r4')).toBeNull();
  });

  it('边界：已是挂机点不再是当前战斗时，两个入口互不干扰', () => {
    const { onSetIdleTarget } = setup({ isIdleTarget: true, current: false });
    expect(onSetIdleTarget).not.toHaveBeenCalled();
    expect(screen.getByTestId('zone-enter-zone_r4')).toBeInTheDocument();
  });
});
