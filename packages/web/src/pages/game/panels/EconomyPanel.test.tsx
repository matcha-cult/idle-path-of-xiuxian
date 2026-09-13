/**
 * EconomyPanel（新版·玩法驱动）测试。
 * 重点：炼器动作链（选物→选工艺→定向参数→确认）是否发出正确请求、可用性原因是否说清、
 * 结果两支与协议字段不上屏。常量一律从 transport 导入，交互用例必须先 `await harness.connect()`。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CRAFT_OPS, ECONOMY_CMD } from '@idle-path/ionet-transport';
import type { CraftResultData, CurrencyView, EssenceView, ItemView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { EconomyPanel } from './EconomyPanel.js';

function makeItem(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 33,
    baseId: 1,
    baseCode: 'sword_1',
    name: '青锋剑',
    category: 'weapon',
    slot: 'weapon',
    rarity: 1,
    rarityName: '灵品',
    tier: 3,
    quality: 0,
    status: 'bag',
    affixTexts: ['锋锐 +12'],
    affixes: [
      { affixId: 5, value: 12, polarity: 'prefix', key: 'k1', code: 'aff_atk', name: '锋锐', tier: 2 },
      { affixId: 6, value: 3, polarity: 'suffix', key: 'k2', code: 'aff_hp', name: '厚土', tier: 1 },
      { affixId: 7, value: 9, polarity: 'suffix', key: 'k3', code: 'aff_def', name: '御土', tier: 1 },
      { affixId: 8, value: 4, polarity: 'prefix', key: 'k4', code: 'aff_sp', name: '蕴灵', tier: 1 },
    ],
    ...overrides,
  };
}

function makeCurrency(overrides: Partial<CurrencyView> = {}): CurrencyView {
  return { id: 1, code: 'chaos', name: '混沌石', description: '重 roll 词条', implemented: true, owned: 3, ...overrides };
}

function makeEssence(overrides: Partial<EssenceView> = {}): EssenceView {
  return {
    id: 1,
    code: 'ess_atk',
    name: '锋锐精华',
    polarity: 'prefix',
    targetFamily: 'aff_atk',
    description: '定向：前缀必出锋锐族',
    owned: 2,
    ...overrides,
  };
}

/**
 * 取 op 选项可点击的 `<label>` 外壳：antd v6 的 `Radio.Button` 把真正的 `<input>`
 * 设为 `pointer-events: none`，点击目标必须落在 label 上（与 ui-kit 测试同口径）。
 */
function opLabelOf(op: string): HTMLElement {
  const wrapper = screen.getByTestId(`craft-op-picker-item-${op}`).closest('label');
  if (!wrapper) throw new Error(`未找到 ${op} 的 label 外壳`);
  return wrapper;
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.economy.currencies = [makeCurrency()];
    harness.root.economy.essences = [makeEssence()];
    seedFn?.(harness.root);
  });
  return harness;
}

describe('EconomyPanel · 图鉴与三态', () => {
  it('渲染通货/精华图鉴与炼器炉，且不把协议 code 打到屏幕上', () => {
    const harness = setup((root) => {
      root.item.items = [makeItem()];
    });
    harness.render(<EconomyPanel />);

    expect(screen.getByTestId('economy-currencies')).toHaveTextContent('混沌石');
    expect(screen.getByTestId('economy-essences')).toHaveTextContent('锋锐精华');
    expect(screen.getByTestId('economy-ops')).toBeInTheDocument();
    expect(screen.getByTestId('economy-selected')).toHaveTextContent('从背包里选一件要炼的物品');
  });

  it('无掉落来源的通货有如实角标，五项有掉落的没有', () => {
    const harness = setup((root) => {
      root.economy.currencies = [
        makeCurrency({ id: 1, code: 'chaos', name: '混沌石' }),
        makeCurrency({ id: 2, code: 'annul', name: '剥离石', owned: 0 }),
      ];
    });
    harness.render(<EconomyPanel />);

    expect(screen.getByTestId('economy-currency-1')).not.toHaveTextContent('无掉落来源');
    expect(screen.getByTestId('economy-currency-2')).toHaveTextContent('无掉落来源');
  });

  it('空态：通货与精华都为空时显示空态文案', () => {
    const harness = createPanelHarness();
    harness.render(<EconomyPanel />);

    // 炼器炉 / 通货图鉴 / 精华图鉴三个区块各自进入空态。
    expect(screen.getAllByTestId('async-boundary-empty')).toHaveLength(3);
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
});

describe('EconomyPanel · 炼器动作链', () => {
  it('选物 → 选混沌石 → 确认后经 WS 发出 economy.craft（itemId/op 正确）', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem()];
    });
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('economy-pick-item'));
    await userEvent.click(await screen.findByTestId('item-picker-card-33'));
    await userEvent.click(opLabelOf('chaos'));
    await userEvent.click(screen.getByTestId('economy-craft'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.craft).length,
      ).toBe(1),
    );
    const request = harness.requests.find((r) => r.subCmd === ECONOMY_CMD.craft);
    expect(request?.data).toEqual({ itemId: 33, op: CRAFT_OPS[2] });
  }, 20000);

  it('精华定向：选中精华后请求带上 essenceCode', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem()];
    });
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('economy-pick-item'));
    await userEvent.click(await screen.findByTestId('item-picker-card-33'));
    await userEvent.click(opLabelOf('essence'));
    await userEvent.click(screen.getByTestId('economy-extra-select'));
    await userEvent.click(await screen.findByTitle('锋锐精华 ×2'));
    await userEvent.click(screen.getByTestId('economy-craft'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.craft).length,
      ).toBe(1),
    );
    const request = harness.requests.find((r) => r.subCmd === ECONOMY_CMD.craft);
    expect(request?.data).toEqual({ itemId: 33, op: 'essence', essenceCode: 'ess_atk' });
  }, 20000);

  it('通货不足：对应操作禁用并给出「缺少该工艺通货」原因', async () => {
    const harness = setup((root) => {
      root.economy.currencies = [makeCurrency({ owned: 0 })];
      root.item.items = [makeItem()];
    });
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('economy-pick-item'));
    await userEvent.click(await screen.findByTestId('item-picker-card-33'));

    expect(screen.getByTestId('craft-op-picker-item-chaos')).toBeDisabled();
    await userEvent.hover(screen.getByTestId('craft-op-picker-tip-chaos'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('缺少该工艺通货');
  });

  it('传奇物品：所有炼器操作禁用并说明「词缀固定」', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem({ rarity: 3, rarityName: '传奇' })];
    });
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('economy-pick-item'));
    await userEvent.click(await screen.findByTestId('item-picker-card-33'));

    expect(screen.getByTestId('craft-op-picker-item-chaos')).toBeDisabled();
    await userEvent.hover(screen.getByTestId('craft-op-picker-tip-chaos'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('传奇物品词缀固定');
  }, 20000);

  it('未选物品时炼器按钮禁用，原因提示先选物品', () => {
    const harness = setup();
    harness.render(<EconomyPanel />);

    expect(screen.getByTestId('economy-craft')).toBeDisabled();
    expect(screen.getByTestId('economy-block-reason')).toHaveTextContent('先选择一种炼器操作');
  });
});

describe('EconomyPanel · 结果与开发者工具', () => {
  it('lastCraft 未摧毁分支展示物品名与词条，摧毁分支只给摧毁文案', () => {
    const harness = setup((root) => {
      root.economy.lastCraft = { item: makeItem(), outcome: 'empowered' } as CraftResultData;
    });
    const view = harness.render(<EconomyPanel />);

    const result = screen.getByTestId('economy-last-craft');
    expect(result).toHaveTextContent('青锋剑');
    expect(result).toHaveTextContent('锋锐');
    expect(screen.getByTestId('economy-craft-outcome')).toHaveTextContent('强化');
    view.unmount();

    harness.seed(() => {
      harness.root.economy.lastCraft = { destroyed: true, itemId: 99 };
    });
    harness.render(<EconomyPanel />);
    expect(screen.getByTestId('economy-craft-destroyed')).toHaveTextContent('摧毁');
    expect(screen.getByTestId('economy-last-craft')).not.toHaveTextContent('99');
  });

  it('开发注入通货：选中名称 → 确认后发出 economy.currencyGrant', async () => {
    const harness = setup();
    harness.render(<EconomyPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('economy-inject-select'));
    await userEvent.click(await screen.findByTitle('混沌石（通货 ×3）'));
    await userEvent.click(screen.getByTestId('economy-grant-currency'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.currencyGrant).length,
      ).toBe(1),
    );
    const request = harness.requests.find((r) => r.subCmd === ECONOMY_CMD.currencyGrant);
    expect(request?.data).toEqual({ code: 'chaos', count: 1 });
  }, 20000);

  it('开发注入精华：确认后发出 economy.essenceGrant；未选目标时按钮禁用', async () => {
    const harness = setup();
    harness.render(<EconomyPanel />);
    await harness.connect();

    expect(screen.getByTestId('economy-grant-currency')).toBeDisabled();
    expect(screen.getByTestId('economy-grant-essence')).toBeDisabled();

    await userEvent.click(screen.getByTestId('economy-inject-select'));
    await userEvent.click(await screen.findByTitle('锋锐精华（精华 ×2）'));
    await userEvent.click(screen.getByTestId('economy-grant-essence'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.essenceGrant).length,
      ).toBe(1),
    );
    const request = harness.requests.find((r) => r.subCmd === ECONOMY_CMD.essenceGrant);
    expect(request?.data).toEqual({ code: 'ess_atk', count: 1 });
  }, 20000);
});

describe('EconomyPanel · 边界与协议字段', () => {
  it('边界：通货/精华/背包全空时各区块空态不崩', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.economy.currencies = [];
      harness.root.economy.essences = [];
      harness.root.item.items = [];
    });
    harness.render(<EconomyPanel />);

    expect(screen.getAllByTestId('async-boundary-empty')).toHaveLength(3);
    expect(screen.queryByTestId('economy-craft-item')).toBeNull();
    expect(screen.queryByTestId('economy-block-reason')).toBeNull();
  });

  it('协议字段不上屏，且不出现 ISO 时间串', () => {
    const harness = setup((root) => {
      root.item.items = [makeItem()];
      root.economy.lastCraft = { destroyed: true, itemId: 42 };
    });
    harness.render(<EconomyPanel />);

    const text = document.body.textContent ?? '';
    for (const leaked of ['chaos', 'ess_atk', 'aff_atk', 'targetFamily', 'implemented', 'outcome', 'baseCode', 'itemId']) {
      expect(text).not.toContain(leaked);
    }
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
