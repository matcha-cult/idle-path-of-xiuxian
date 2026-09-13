/** EconomyPanel 测试：通货 / 精华表格、炼器表单交互、lastCraft 两分支、三态、边界。 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CRAFT_OPS, ECONOMY_CMD } from '@idle-path/ionet-transport';
import type { CraftResultData, CurrencyView, EssenceView, ItemView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { EconomyPanel } from './EconomyPanel.js';

function makeCurrency(overrides: Partial<CurrencyView> = {}): CurrencyView {
  return { id: 1, code: 'chaos', name: '混沌石', description: '', implemented: true, owned: 12, ...overrides };
}

function makeEssence(overrides: Partial<EssenceView> = {}): EssenceView {
  return { id: 2, code: 'ember_fire', name: '烈焰精华', polarity: 'fire', targetFamily: 'weapon', description: '', owned: 3, ...overrides };
}

function makeItem(overrides: Partial<ItemView> = {}): ItemView {
  return { id: 33, baseId: 1, baseCode: 'sword_1', name: '青锋剑', category: 'weapon', slot: 'weapon', rarity: 1, rarityName: '灵品', tier: 3, quality: 0, status: 'bag', affixTexts: [], affixes: [], ...overrides };
}

function makeCraft(overrides: Partial<CraftResultData> = {}): CraftResultData {
  return { item: makeItem(), outcome: 'empowered', ...overrides } as CraftResultData;
}

describe('EconomyPanel', () => {
  it('渲染通货与精华两张表（code / 名称 / 持有量）', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.economy.currencies = [makeCurrency()];
      harness.root.economy.essences = [makeEssence()];
    });
    harness.render(<EconomyPanel />);

    expect(screen.getByText('混沌石')).toBeInTheDocument();
    expect(screen.getByText('chaos')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('烈焰精华')).toBeInTheDocument();
    expect(screen.getByText('ember_fire')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('空态：通货与精华都为空时显示空态文案', () => {
    const harness = createPanelHarness();
    harness.render(<EconomyPanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无通货与精华数据')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.economy.loading = true;
    });
    const view = harness.render(<EconomyPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.economy.loading = false;
      harness.root.economy.error = '经济面板加载失败';
    });
    harness.render(<EconomyPanel />);
    expect(screen.getByText('经济面板加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('炼器表单提交经 WS 发出 economy.craft（itemId / op 正确）', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.economy.currencies = [makeCurrency()];
    });
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.type(screen.getByTestId('number-field-itemId'), '42');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByTitle(CRAFT_OPS[0]));
    await userEvent.click(screen.getByRole('button', { name: /炼\s*器/ }));

    const requests = harness.requests.filter(
      (r) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.craft,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({ itemId: 42, op: CRAFT_OPS[0] });
  }, 20000);

  it('lastCraft 未摧毁分支展示物品名，摧毁分支显示「物品已摧毁」', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.economy.currencies = [makeCurrency()];
      harness.root.economy.lastCraft = makeCraft({ item: makeItem({ id: 33, name: '青锋剑' }) });
    });
    const view = harness.render(<EconomyPanel />);
    expect(screen.getByTestId('economy-last-craft')).toBeInTheDocument();
    expect(screen.getByText('青锋剑')).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.economy.lastCraft = { destroyed: true, itemId: 9 };
    });
    harness.render(<EconomyPanel />);
    expect(screen.getByText('物品已摧毁')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('开发注入通货：确认后经 WS 发出 economy.currencyGrant', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.economy.currencies = [makeCurrency()];
    });
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.type(screen.getByTestId('economy-inject-code'), 'chaos');
    await userEvent.click(screen.getByTestId('economy-grant-currency'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    const requests = harness.requests.filter(
      (r) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.currencyGrant,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({ code: 'chaos', count: 1 });
  }, 20000);

  it('开发注入精华：确认后经 WS 发出 economy.essenceGrant', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.economy.essences = [makeEssence()];
    });
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.type(screen.getByTestId('economy-inject-code'), 'ember_fire');
    await userEvent.click(screen.getByTestId('economy-grant-essence'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    const requests = harness.requests.filter(
      (r) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.essenceGrant,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({ code: 'ember_fire', count: 1 });
  }, 20000);
});
