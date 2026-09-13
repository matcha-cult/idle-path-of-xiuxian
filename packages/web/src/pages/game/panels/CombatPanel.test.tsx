/**
 * CombatPanel 测试：渲染 / 空态 / 三态 / 交互真发请求 / 边界（dropTables=[] 不崩）。
 * 交互用例必须先 `await harness.connect()`；seed 一律在 `harness.seed()` 内。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { COMBAT_CMD } from '@idle-path/ionet-transport';
import type { DropTableView, UnitCatalogView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { CombatPanel } from './CombatPanel.js';

function makeUnit(overrides: Partial<UnitCatalogView> = {}): UnitCatalogView {
  return {
    id: 1, code: 'wolf', name: '灰狼', realm: 1, realmName: '炼气一层', camp: 'hostile',
    givesLingyun: true, dropTable: 'wolf_drop', baseStats: { hp: 10, atk: 2, def: 1 },
    hiddenPool: [], lingyunReward: 5,
    ...overrides,
  };
}

function makeDropTable(overrides: Partial<DropTableView> = {}): DropTableView {
  return {
    id: 1, code: 'wolf_drop', name: '灰狼掉落', dropsPerKill: 1, tierOffset: 0,
    entries: [
      {
        kind: 'base', baseId: 1, baseTier: 1, rarity: 1, currencyCode: null,
        essenceCode: null, minCount: 1, maxCount: 1, weight: 10,
      },
    ],
    ...overrides,
  };
}

describe('CombatPanel', () => {
  it('渲染单位图鉴与掉落表：编码 / 名称 / 阵营 / 境界 / 条目数', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.combat.dropTables = [makeDropTable()];
    });
    harness.render(<CombatPanel />);

    expect(screen.getByText('单位 1 种 · 掉落表 1 张')).toBeInTheDocument();
    expect(screen.getByText('wolf')).toBeInTheDocument();
    expect(screen.getByText('灰狼')).toBeInTheDocument();
    expect(screen.getByText('hostile')).toBeInTheDocument();
    expect(screen.getByText('炼气一层')).toBeInTheDocument();
    expect(screen.getByText('灰狼掉落')).toBeInTheDocument();
    expect(screen.getByText('条目数')).toBeInTheDocument();
  });

  it('单位与掉落表均为空时显示空态', () => {
    const harness = createPanelHarness();
    harness.render(<CombatPanel />);

    expect(screen.getByText('暂无图鉴数据')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.loading = true;
    });
    const view = harness.render(<CombatPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.combat.loading = false;
      harness.root.combat.error = '战斗图鉴加载失败';
    });
    harness.render(<CombatPanel />);
    expect(screen.getByText('战斗图鉴加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('边界：dropTables 为空不崩，单位表照常渲染且掉落表显示空态', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.combat.dropTables = [];
    });
    harness.render(<CombatPanel />);

    expect(screen.getByText('灰狼')).toBeInTheDocument();
    expect(screen.getByText('暂无掉落表')).toBeInTheDocument();
    expect(screen.getByText('单位 1 种 · 掉落表 0 张')).toBeInTheDocument();
  });

  it('点击「生成」发出 combat.spawn；点击「击杀」并确认发出 combat.kill（默认 count=1）', async () => {
    const harness = createPanelHarness({
      handler: (request) =>
        request.cmd === COMBAT_CMD.cmd && request.subCmd === COMBAT_CMD.spawn
          ? { data: { success: true, message: 'ok', data: {} } }
          : null,
    });
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
    });
    harness.render(<CombatPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('combat-spawn-wolf'));
    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === COMBAT_CMD.cmd && r.subCmd === COMBAT_CMD.spawn);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ code: 'wolf' });
    });

    await waitFor(() => expect(screen.getByTestId('combat-kill-wolf')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('combat-kill-wolf'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === COMBAT_CMD.cmd && r.subCmd === COMBAT_CMD.kill);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ code: 'wolf', count: 1 });
    });
  });

  it('击杀数量由 QuantityInput 控制（1..50）：改为 3 后 kill 携带 count=3', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
    });
    harness.render(<CombatPanel />);
    await harness.connect();

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('aria-valuemin', '1');
    expect(input).toHaveAttribute('aria-valuemax', '50');
    fireEvent.change(input, { target: { value: '3' } });

    await userEvent.click(screen.getByTestId('combat-kill-wolf'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const sent = harness.requests.filter((r) => r.cmd === COMBAT_CMD.cmd && r.subCmd === COMBAT_CMD.kill);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.data).toEqual({ code: 'wolf', count: 3 });
    });
  });
});
