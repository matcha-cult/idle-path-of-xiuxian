/**
 * ZonePanel（§22 重做）测试：**已突破秘境列表**。
 *
 * 从 `ZonePanel.test.tsx` 拆出（单文件规模）。要点：
 * - 秘境页面只列已突破秘境，卡上出现「第 N 境」「历练秘境/特殊秘境」，入口文案是「重复挑战」；
 * - 旧的锁定态用例（境界不足 / 前置未满足）已删除 —— 未突破的秘境根本不下发；
 * - 挂机点名字要用 `zone.breakthrough`（全 13 境名录）反查。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  ZONE_CMD,
  type ZoneBreakthroughView,
  type ZoneView,
} from '@idle-path/ionet-transport';
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
    current: false,
    progress: { floor: 4, bestFloor: 4, cleared: false, clears: 2 },
    ...overrides,
  };
}

/** 突破名录条目（ZonePanel 只用 code 反查挂机点名；其余字段补全以满足类型）。 */
function makeBreakthrough(overrides: Partial<ZoneBreakthroughView> = {}): ZoneBreakthroughView {
  return {
    code: 'zone_1',
    name: '青云山脚',
    realm: 1,
    tierKind: 'training',
    canBreakthrough: true,
    lockReason: 'ok',
    unlockItemCode: null,
    cleared: true,
    clears: 2,
    bestFloor: 4,
    maxFloor: 10,
    basePower: 20,
    powerStep: 4,
    ...overrides,
  };
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.zone.zones = [makeZone()];
    harness.root.zone.currentZone = null;
    seedFn?.(harness.root);
  });
  return harness;
}

describe('ZonePanel · 已突破秘境列表', () => {
  it('卡片显示 第 N 境 / 类别 / 进度 / 通关轮数，入口文案为「重复挑战」', () => {
    const harness = setup((root) => {
      root.zone.zones = [
        makeZone({ id: 2, code: 'zone_2', name: '落霞谷', realm: 5 }),
        makeZone({ id: 3, code: 'zone_3', name: '寒潭', realm: 9, tierKind: 'special' }),
      ];
    });
    harness.render(<ZonePanel />);

    const card = within(screen.getByTestId('zone-list')).getByTestId('zone-card-zone_2');
    expect(card).toHaveTextContent('落霞谷');
    expect(card).toHaveTextContent('第 5 境');
    expect(card).toHaveTextContent('历练秘境');
    expect(card).toHaveTextContent('进度 4 / 10 层');
    expect(card).toHaveTextContent('已通关 2 轮');
    expect(within(card).getByText('重复挑战')).toBeInTheDocument();

    expect(screen.getByTestId('zone-card-zone_3')).toHaveTextContent('第 9 境');
    expect(screen.getByTestId('zone-card-zone_3')).toHaveTextContent('特殊秘境');
    expect(screen.getByTestId('zone-total')).toHaveTextContent('共 2 处');
  });

  it('当前战斗中的秘境不给「重复挑战」，改为「已在此秘境战斗」', () => {
    const harness = setup((root) => {
      root.zone.currentZone = 'zone_1';
    });
    harness.render(<ZonePanel />);

    expect(screen.queryByTestId('zone-enter-zone_1')).toBeNull();
    expect(screen.getByTestId('zone-card-zone_1')).toHaveTextContent('战斗中');
    expect(screen.getByTestId('zone-card-zone_1')).toHaveTextContent('已在此秘境战斗');
  });

  it('点「重复挑战」经确认后发出 zone.enter', async () => {
    const harness = setup((root) => {
      root.zone.zones = [makeZone(), makeZone({ id: 2, code: 'zone_2', name: '落霞谷' })];
    });
    harness.render(<ZonePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('zone-enter-zone_2'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定|OK/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.enter).length,
      ).toBeGreaterThan(0),
    );
  });

  it('挂机点：从突破名录 join 到名字就显示「当前挂机点：X」，join 不到不渲染', () => {
    const harness = setup((root) => {
      root.zone.breakthrough = [makeBreakthrough()];
      root.zone.idleTarget = 'zone_1';
    });
    const view = harness.render(<ZonePanel />);
    expect(screen.getByTestId('zone-idle-target')).toHaveTextContent('当前挂机点：青云山脚');
    view.unmount();

    harness.seed(() => {
      harness.root.zone.idleTarget = 'zone_ghost';
    });
    harness.render(<ZonePanel />);
    expect(screen.queryByTestId('zone-idle-target')).toBeNull();
  });

  it('空态：未突破任何秘境时给出空态文案', () => {
    const harness = createPanelHarness();
    harness.render(<ZonePanel />);
    expect(screen.getByText('尚未突破任何秘境')).toBeInTheDocument();
    expect(screen.getByTestId('zone-total')).toHaveTextContent('共 0 处');
  });
});
