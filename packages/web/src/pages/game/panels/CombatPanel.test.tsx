/**
 * CombatPanel 测试（新版 §1.8）：单位图鉴 / 掉落表 / 辨宝法阵三页签。
 * 覆盖：正常渲染 / 空态 / loading+error / 交互真发出 cmd+subCmd / 边界（空数组、缺映射）/
 * 协议字段不上屏（不含 DTO 字段名与 ISO 时间串）。
 * 交互用例必须先 `await harness.connect()`；常量一律从 `@idle-path/ionet-transport` 导入。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { COMBAT_CMD, type DropTableView, type PickupRuleView, type SettlementData, type UnitCatalogView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { CombatPanel } from './CombatPanel.js';
import { dropEntryLabel } from './combat/presentation.js';

function makeUnit(overrides: Partial<UnitCatalogView> = {}): UnitCatalogView {
  return {
    id: 1,
    code: 'wolf',
    name: '灰狼',
    realm: 1,
    realmName: '炼气一层',
    camp: 'hostile',
    givesLingyun: true,
    dropTable: 'wolf_drop',
    baseStats: { hp: 10, atk: 2, def: 1, spiritPower: 0 },
    hiddenPool: ['secret_hidden_code'],
    lingyunReward: 5,
    ...overrides,
  };
}

function makeDropTable(overrides: Partial<DropTableView> = {}): DropTableView {
  return {
    id: 1,
    code: 'wolf_drop',
    name: '灰狼掉落',
    dropsPerKill: 1,
    tierOffset: 0,
    entries: [
      {
        kind: 'base',
        baseId: 7,
        baseTier: 2,
        rarity: 1,
        currencyCode: null,
        essenceCode: null,
        minCount: 1,
        maxCount: 2,
        weight: 30,
      },
      {
        kind: 'currency',
        baseId: null,
        baseTier: null,
        rarity: null,
        currencyCode: 'chaos',
        essenceCode: null,
        minCount: 1,
        maxCount: 1,
        weight: 10,
      },
      {
        kind: 'essence',
        baseId: null,
        baseTier: null,
        rarity: null,
        currencyCode: null,
        essenceCode: 'ember',
        minCount: 1,
        maxCount: 1,
        weight: 10,
      },
    ],
    ...overrides,
  };
}

function makeRule(overrides: Partial<PickupRuleView> = {}): PickupRuleView {
  return {
    id: 9,
    characterId: 42,
    name: '宝品以上保留',
    rarityMin: 2,
    tierMin: 5,
    affixCodes: ['a', 'b'],
    action: 'keep',
    enabled: true,
    priority: 100,
    ...overrides,
  };
}

type Req = { cmd: number; subCmd: number };
const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });
const isSpawn = (r: Req) => r.cmd === COMBAT_CMD.cmd && r.subCmd === COMBAT_CMD.spawn;
const isKill = (r: Req) => r.cmd === COMBAT_CMD.cmd && r.subCmd === COMBAT_CMD.kill;

/** 假服务端的击杀结算体（六段齐全，便于断言摘要中文标签与数值）。 */
const KILL_SETTLEMENT: SettlementData = {
  unit: { code: 'wolf', name: '灰狼', realm: 1 },
  kills: 3,
  lingyunGained: 15,
  lingyunTotal: 115,
  items: [],
  kept: 2,
  salvaged: { count: 1, lingyun: 4 },
  sold: { count: 2, spiritStones: 30 },
  discarded: 1,
  blockedByTier: 1,
  currencies: { chaos: 2 },
  essences: { ember: 1 },
  itemsProduced: 6,
};

/** dev 接口假服务端：生成与击杀都回成功体，便于断言加载态收敛。 */
function combatHandler(request: Req) {
  if (isSpawn(request)) return ok({ unit: { code: 'wolf', name: '灰狼' } });
  if (isKill(request)) return ok(KILL_SETTLEMENT);
  return null;
}

describe('CombatPanel', () => {
  it('渲染单位图鉴：名称 / 阵营中文 / 境界 / 四维与灵韵奖励，并给出汇总', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.combat.dropTables = [makeDropTable()];
      harness.root.item.pickupRules = [makeRule()];
    });
    harness.render(<CombatPanel />);

    expect(screen.getByText(/共 1 种单位 · 1 张掉落表 · 1 条辨宝规则/)).toBeInTheDocument();
    const units = screen.getByTestId('combat-units-tab');
    expect(within(units).getByText('灰狼')).toBeInTheDocument();
    expect(within(units).getByText('敌对')).toBeInTheDocument();
    expect(within(units).getByText(/炼气一层/)).toBeInTheDocument();
    const stats = screen.getByTestId('combat-unit-stats-wolf');
    expect(within(stats).getByText('气血')).toBeInTheDocument();
    expect(within(stats).getByText('神识')).toBeInTheDocument();
    expect(within(units).getByText(/击杀奖励：灵韵 5/)).toBeInTheDocument();
    // 隐藏词条 code 绝不展示（§1.8）。
    expect(screen.queryByText(/secret_hidden_code/)).not.toBeInTheDocument();

    // 未成功击杀过 → 不渲染结算摘要（不出空壳）。
    expect(screen.queryByTestId('combat-settlement')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settlement-summary-root')).not.toBeInTheDocument();
    expect(screen.queryByText('本次击杀结算')).not.toBeInTheDocument();
  });

  it('全空时显示整卡空态；有数据但辨宝无规则时该页签给空态提示', async () => {
    const harness = createPanelHarness();
    harness.render(<CombatPanel />);

    expect(screen.getByText('暂无图鉴数据')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.combat.dropTables = [];
      harness.root.item.pickupRules = [];
    });
    await waitFor(() => expect(screen.getByRole('tab', { name: '单位图鉴' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: /辨\s*宝\s*法\s*阵/ }));
    expect(screen.getByText(/掉落将全部按默认动作处理/)).toBeInTheDocument();
  });

  it('loading 显示骨架、error 显示可重试', () => {
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

  it('掉落表页签：权重归一为概率、按类别小计、通货走中文名且不回显 code', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.combat.dropTables = [makeDropTable()];
      harness.root.economy.currencies = [
        { id: 1, code: 'chaos', name: '混沌石', description: '', implemented: true, owned: 0 },
      ];
      harness.root.economy.essences = [
        { id: 2, code: 'ember', name: '余烬精华', polarity: 'prefix', targetFamily: 'x', description: '', owned: 0 },
      ];
    });
    harness.render(<CombatPanel />);

    await userEvent.click(screen.getByRole('tab', { name: '掉落表' }));
    const pool = screen.getByTestId('combat-drop-table-wolf_drop');
    expect(within(pool).getByText('T2 · 灵品')).toBeInTheDocument();
    expect(within(pool).getByText('混沌石')).toBeInTheDocument();
    expect(within(pool).getByText('余烬精华')).toBeInTheDocument();
    // 权重 30/50 = 60.0%，小计行给出类别概率合计。
    expect(within(pool).getByTestId('drop-pool-probability-0')).toHaveTextContent('60.0%');
    expect(within(pool).getByTestId('drop-pool-subtotal-probability-base')).toHaveTextContent('60.0%');
    expect(within(pool).getByTestId('drop-pool-subtotal-probability-currency')).toHaveTextContent('20.0%');
    expect(screen.queryByText('chaos')).not.toBeInTheDocument();
    expect(screen.queryByText('ember')).not.toBeInTheDocument();
  });

  it('辨宝法阵页签：渲染规则字段（优先级 / 稀有度中文 / 动作中文 / 词条条数）', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.item.pickupRules = [makeRule(), makeRule({ id: 10, name: '低阶分解', action: 'salvage', enabled: false, affixCodes: [] })];
    });
    harness.render(<CombatPanel />);

    await userEvent.click(screen.getByRole('tab', { name: /辨\s*宝\s*法\s*阵/ }));
    const tab = screen.getByTestId('combat-pickup-tab');
    expect(within(tab).getByText('宝品以上保留')).toBeInTheDocument();
    expect(within(tab).getAllByText('100').length).toBeGreaterThanOrEqual(1);
    expect(within(tab).getAllByText('T5').length).toBeGreaterThanOrEqual(1);
    expect(within(tab).getByText('2 条')).toBeInTheDocument();
    expect(within(tab).getByText('不限')).toBeInTheDocument();
    expect(within(tab).getByText('保留')).toBeInTheDocument();
    expect(within(tab).getByText('分解')).toBeInTheDocument();
    expect(within(tab).getByText('已停用')).toBeInTheDocument();
  });

  it('「生成实例」发出 combat.spawn；「击杀」两步确认后发出 combat.kill（count=1）', async () => {
    const harness = createPanelHarness({ handler: combatHandler });
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
    });
    harness.render(<CombatPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('combat-spawn-wolf'));
    await waitFor(() => expect(harness.requests.filter(isSpawn)).toHaveLength(1));
    expect(harness.requests.filter(isSpawn)[0]?.data).toEqual({ code: 'wolf' });

    await userEvent.click(screen.getByTestId('combat-kill-wolf'));
    expect(await screen.findByText('击杀「灰狼」×1？')).toBeInTheDocument();
    expect(harness.requests.filter(isKill)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /确认击杀/ }));
    await waitFor(() => expect(harness.requests.filter(isKill)).toHaveLength(1));
    expect(harness.requests.filter(isKill)[0]?.data).toEqual({ code: 'wolf', count: 1 });
  });

  it('边界：击杀数量 1..50 的输入作用于 kill；非敌对单位不可击杀', async () => {
    const harness = createPanelHarness({ handler: combatHandler });
    harness.seed(() => {
      harness.root.combat.units = [
        makeUnit(),
        makeUnit({ id: 2, code: 'deer', name: '灵鹿', camp: 'friendly', givesLingyun: false }),
      ];
      harness.root.combat.total = 2;
    });
    harness.render(<CombatPanel />);
    await harness.connect();

    // friendly 单位按钮禁用且不可确认。
    expect(within(screen.getByTestId('combat-unit-deer')).getByText('不可击杀')).toBeInTheDocument();

    const inputs = screen.getAllByTestId('quantity-input');
    const input = inputs[0]!;
    await userEvent.clear(input);
    await userEvent.type(input, '50');
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('50'));

    await userEvent.click(screen.getByTestId('combat-kill-wolf'));
    await userEvent.click(await screen.findByRole('button', { name: /确认击杀/ }));
    await waitFor(() => expect(harness.requests.filter(isKill)).toHaveLength(1));
    expect(harness.requests.filter(isKill)[0]?.data).toEqual({ code: 'wolf', count: 50 });
  });

  it('边界：掉落条目缺少映射 / 空条目时给出占位文案，不出现 DTO 字段名与 ISO 时间', () => {
    // 未提供 economy 映射 → 通货 / 精华给占位文案而非 code。
    const entry = makeDropTable().entries[1]!;
    expect(dropEntryLabel(entry, () => undefined)).toBe('未知通货');
    // 未选表且 tables 为空 → 走空态。
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.combat.dropTables = [];
    });
    harness.render(<CombatPanel />);

    const html = document.body.textContent ?? '';
    for (const forbidden of ['baseTier', 'lingyunReward', 'hiddenPool', 'dropTable', 'givesLingyun']) {
      expect(html).not.toContain(forbidden);
    }
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('成功击杀后渲染「本次击杀结算」SettlementSummary（≥4 项中文标签 + 数值，含 code→中文名）', async () => {
    const harness = createPanelHarness({ handler: combatHandler });
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.economy.currencies = [
        { id: 1, code: 'chaos', name: '混沌石', description: '', implemented: true, owned: 0 },
      ];
      harness.root.economy.essences = [
        { id: 2, code: 'ember', name: '余烬精华', polarity: 'prefix', targetFamily: 'x', description: '', owned: 0 },
      ];
    });
    harness.render(<CombatPanel />);
    await harness.connect();

    expect(screen.queryByTestId('combat-settlement')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('combat-kill-wolf'));
    await userEvent.click(await screen.findByRole('button', { name: /确认击杀/ }));

    await waitFor(() => expect(screen.getByTestId('combat-settlement')).toBeInTheDocument());
    const card = screen.getByTestId('combat-settlement');
    // `combat.lastKill` 已由 store 写入（面板只消费，不重判协议）。
    expect(harness.root.combat.lastKill?.kills).toBe(3);
    expect(within(card).getByText(/击杀 3 次/)).toBeInTheDocument();

    // 六段语义的中文标签。
    for (const label of ['灵韵', '保留物品', '分解', '出售', '弃置', '卡阶跳过']) {
      expect(within(card).getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
    expect(within(card).getByTestId('settlement-lingyun')).toHaveTextContent('+15');
    expect(within(card).getByTestId('settlement-lingyun')).toHaveTextContent('共 115');
    expect(within(card).getByTestId('settlement-kept')).toHaveTextContent('2 件');
    expect(within(card).getByTestId('settlement-salvaged')).toHaveTextContent('1 件 → 灵韵 +4');
    expect(within(card).getByTestId('settlement-sold')).toHaveTextContent('2 件 → 灵石 +30');
    expect(within(card).getByTestId('settlement-discarded')).toHaveTextContent('1 件');
    expect(within(card).getByTestId('settlement-blocked-by-tier')).toHaveTextContent('1 件');

    // 掉落资源走中文名，绝不回显 code。
    const resources = within(card).getByTestId('settlement-resources');
    expect(within(resources).getByText('混沌石 ×2')).toBeInTheDocument();
    expect(within(resources).getByText('余烬精华 ×1')).toBeInTheDocument();
    expect(within(card).queryByText(/chaos/)).toBeNull();
    expect(within(card).queryByText(/ember/)).toBeNull();
  });

  it('掉落表页签隐藏原始权重列（showWeight=false）：无「权重」列头与权重单元格，概率照常', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.combat.units = [makeUnit()];
      harness.root.combat.total = 1;
      harness.root.combat.dropTables = [makeDropTable()];
    });
    harness.render(<CombatPanel />);

    await userEvent.click(screen.getByRole('tab', { name: '掉落表' }));
    const pool = screen.getByTestId('combat-drop-table-wolf_drop');
    expect(within(pool).queryByRole('columnheader', { name: '权重' })).toBeNull();
    expect(within(pool).queryByTestId('drop-pool-weight-0')).toBeNull();
    // 小计行不再带权重合计（rc-table Summary.Cell 不透传 testid，按行文本断言）。
    expect(within(pool).getByTestId('drop-pool-subtotal-base')).not.toHaveTextContent('30');

    // 概率列与小计保留。
    expect(within(pool).getByRole('columnheader', { name: '概率' })).toBeInTheDocument();
    expect(within(pool).getByTestId('drop-pool-probability-0')).toHaveTextContent('60.0%');
    expect(within(pool).getByTestId('drop-pool-subtotal-probability-base')).toHaveTextContent('60.0%');
  });
});
