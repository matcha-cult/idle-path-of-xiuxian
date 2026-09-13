/**
 * BagPanel（新版·玩法驱动）测试。
 * 覆盖：玩法信息是否呈现 / 三态 / 交互真发出对应 `cmd+subCmd`（常量取自 transport）/
 * 边界（空数组、超阶、非有限数）/ 协议字段与 ISO 时间串是否真的没上屏。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EQUIP_CMD, ITEM_CMD, PROP_CMD, type AffixView, type Character, type ItemView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { BagPanel } from './BagPanel.js';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 1,
    userId: 1,
    nickname: '验收道友',
    gender: 'male',
    title: '散修',
    spiritStones: 0,
    silver: 0,
    realm: 5,
    lingyun: 0,
    jadeSlips: 0,
    ...overrides,
  };
}

function makeAffix(overrides: Partial<AffixView> = {}): AffixView {
  return {
    affixId: 7,
    value: 12,
    polarity: 'prefix',
    key: 'atk',
    code: 'aff_atk_1',
    name: '锐锋',
    tier: 2,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 11,
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
    affixTexts: ['攻击 +3'],
    affixes: [makeAffix()],
    ...overrides,
  };
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.session.character = makeCharacter();
    seedFn?.(harness.root);
  });
  return harness;
}

describe('BagPanel · 现状与筛选（玩法信息）', () => {
  it('渲染名称/T 阶/稀有度/词缀/背包状态与总件数', () => {
    const harness = setup((root) => {
      root.item.items = [makeItem()];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);

    const list = screen.getByTestId('bag-list');
    expect(within(list).getByText('青锋剑')).toBeInTheDocument();
    expect(within(list).getByText('T3')).toBeInTheDocument();
    expect(within(list).getByText('灵品')).toBeInTheDocument();
    expect(within(list).getByText('攻击 +3')).toBeInTheDocument();
    expect(screen.getByTestId('bag-status-11')).toHaveTextContent('在背包');
    expect(screen.getByText(/共 1 件/)).toBeInTheDocument();
  });

  it('品类/稀有度经中文映射上屏，本页件数随筛选变化（QuantityInput 作 T 阶下限）', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem(), makeItem({ id: 12, name: '玄铁甲', category: 'body', slot: 'body', tier: 8 })];
      root.item.total = 2;
    });
    harness.render(<BagPanel />);

    expect(screen.getByTestId('bag-visible-count')).toHaveTextContent('本页 2 / 2 件');

    const [tierMinInput] = screen.getAllByTestId('quantity-input');
    expect(tierMinInput).toBeDefined();
    await userEvent.type(tierMinInput as HTMLElement, '5');

    expect(screen.getByTestId('bag-visible-count')).toHaveTextContent('本页 1 / 2 件');
    expect(screen.queryByText('青锋剑')).toBeNull();
    expect(screen.getByText('玄铁甲')).toBeInTheDocument();
  });

  it('空背包显示空态与引导文案', () => {
    const harness = setup();
    harness.render(<BagPanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText(/先去秘境/)).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = setup((root) => {
      root.item.loading = true;
    });
    const view = harness.render(<BagPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.item.loading = false;
      harness.root.item.error = '背包加载失败';
    });
    harness.render(<BagPanel />);
    expect(screen.getByText('背包加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });
});

describe('BagPanel · 动作（真发请求）', () => {
  it('点「装备」经 WS 发出 equip.equip（itemId 正确）', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem({ id: 11 })];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('bag-equip-11'));

    await waitFor(() => {
      const requests = harness.requests.filter((r) => r.cmd === EQUIP_CMD.cmd && r.subCmd === EQUIP_CMD.equip);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.data).toEqual({ itemId: 11 });
    });
  });

  it('点「丢弃」确认后经 WS 发出 prop.discard', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem({ id: 12 })];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('bag-discard-12'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const requests = harness.requests.filter((r) => r.cmd === PROP_CMD.cmd && r.subCmd === PROP_CMD.discard);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.data).toEqual({ itemId: 12 });
    });
  });

  it('切页经 PagedGrid 发出带 page=2 的 item.inventory', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem()];
      root.item.total = 25;
      root.item.page = 1;
      root.item.pageSize = 20;
    });
    harness.render(<BagPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTitle('2'));

    await waitFor(() =>
      expect(
        harness.requests.some(
          (r) =>
            r.cmd === ITEM_CMD.cmd &&
            r.subCmd === ITEM_CMD.inventory &&
            (r.data as { page?: number } | undefined)?.page === 2,
        ),
      ).toBe(true),
    );
  });

  it('点「刷新背包」经 WS 发出 item.inventory（带分页参数）', async () => {
    const harness = setup((root) => {
      root.item.items = [makeItem()];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('bag-refresh'));

    await waitFor(() => {
      const requests = harness.requests.filter((r) => r.cmd === ITEM_CMD.cmd && r.subCmd === ITEM_CMD.inventory);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.data).toMatchObject({ page: 1, pageSize: 20 });
    });
  });
});

describe('BagPanel · 边界与协议字段', () => {
  it('已装备的物品不能重复装备/丢弃，标签显示「已装备」', () => {
    const harness = setup((root) => {
      root.item.items = [makeItem({ id: 13, status: 'equipped' })];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);

    expect(screen.getByTestId('bag-status-13')).toHaveTextContent('已装备');
    expect(screen.getByTestId('bag-equip-13')).toBeDisabled();
    expect(screen.getByTestId('bag-discard-13')).toBeDisabled();
  });

  it('超阶物品装备按钮禁用并说明「境界不足」（含极值 T14）', async () => {
    const harness = setup((root) => {
      root.session.character = makeCharacter({ realm: 2 });
      root.item.items = [makeItem({ id: 14, tier: 14 })];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);

    const button = screen.getByTestId('bag-equip-14');
    expect(button).toBeDisabled();
    await userEvent.hover(button);
    expect(await screen.findByText(/需 T14/)).toBeInTheDocument();
  });

  it('tier 为 NaN、affixes 为空数组时正常渲染且不崩', () => {
    const harness = setup((root) => {
      root.item.items = [makeItem({ id: 15, tier: Number.NaN, affixes: [], affixTexts: [] })];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);

    expect(screen.getByTestId('bag-equip-15')).toBeDisabled();
    expect(screen.getByText('青锋剑')).toBeInTheDocument();
  });

  it('选中物品后展示「与当前槽位对比」；协议字段与 ISO 时间串不上屏', async () => {
    const harness = setup((root) => {
      root.equip.slots = { weapon: { id: 99, name: '旧铁剑', rarity: 0, tier: 1 } };
      root.item.items = [makeItem({ createdAt: '2026-09-13T10:00:00.000Z' })];
      root.item.total = 1;
    });
    harness.render(<BagPanel />);

    await userEvent.click(screen.getByText('青锋剑'));

    const compare = screen.getByTestId('bag-compare');
    expect(compare).toHaveTextContent('武器');
    expect(compare).toHaveTextContent('旧铁剑');
    expect(compare).toHaveTextContent('可穿戴');
    expect(screen.getByTestId('bag-affixes')).toHaveTextContent('锐锋');
    expect(screen.getByTestId('bag-affixes')).toHaveTextContent('T2');

    const text = document.body.textContent ?? '';
    for (const leaked of ['sword_1', 'baseCode', 'affixId', 'aff_atk_1', 'createdAt', '2026-09-13', 'pageSize', 'quality']) {
      expect(text).not.toContain(leaked);
    }
  });
});
