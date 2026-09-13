/**
 * BagPanel 测试（面板测试的**参考模板**）：
 * - 纯展示断言：用 `harness.seed()` 预置 store 状态；
 * - 交互断言：用 `harness.requests` 断言「点击 → 真的经 WS 调了对应 Action」；
 * - 三态断言：loading / error / empty。
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EQUIP_CMD, ITEM_CMD, PROP_CMD } from '@idle-path/ionet-transport';
import type { ItemView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { BagPanel } from './BagPanel.js';

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
    affixes: [],
    ...overrides,
  };
}

describe('BagPanel', () => {
  it('渲染背包条目：名称/阶/稀有度/词缀/编码', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.item.items = [makeItem()];
      harness.root.item.total = 1;
      harness.root.item.page = 1;
      harness.root.item.pageSize = 20;
    });
    harness.render(<BagPanel />);

    expect(screen.getByText('青锋剑')).toBeInTheDocument();
    expect(screen.getByText('灵品')).toBeInTheDocument();
    expect(screen.getByText('T3')).toBeInTheDocument();
    expect(screen.getByText('攻击 +3')).toBeInTheDocument();
    expect(screen.getByText(/sword_1 · weapon · weapon/)).toBeInTheDocument();
    expect(screen.getByText('共 1 件 · 第 1 页')).toBeInTheDocument();
  });

  it('空背包显示空态与引导文案', () => {
    const harness = createPanelHarness();
    harness.render(<BagPanel />);
    expect(screen.getByText('背包空空如也，先去打点东西吧')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.item.loading = true;
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

  it('点击「装备」经 WS 发出 equip.equip（itemId 正确）', async () => {
    const harness = createPanelHarness({
      handler: (request) =>
        request.cmd === EQUIP_CMD.cmd
          ? { data: { success: true, message: '装备成功', data: { slot: 'weapon', slots: {} } } }
          : null,
    });
    harness.seed(() => {
      harness.root.item.items = [makeItem({ id: 11 })];
      harness.root.item.total = 1;
    });
    harness.render(<BagPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('bag-equip-11'));

    const equipRequests = harness.requests.filter(
      (r) => r.cmd === EQUIP_CMD.cmd && r.subCmd === EQUIP_CMD.equip,
    );
    expect(equipRequests).toHaveLength(1);
    expect(equipRequests[0]?.data).toEqual({ itemId: 11 });
  });

  it('点击「丢弃」经 WS 发出 prop.discard；危险按钮为 danger 样式', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.item.items = [makeItem({ id: 12 })];
      harness.root.item.total = 1;
    });
    harness.render(<BagPanel />);

    await harness.connect();
    const discardButton = screen.getByTestId('bag-discard-12');
    expect(discardButton.className).toContain('dangerous');
    await userEvent.click(discardButton);

    const discardRequests = harness.requests.filter(
      (r) => r.cmd === PROP_CMD.cmd && r.subCmd === PROP_CMD.discard,
    );
    expect(discardRequests).toHaveLength(1);
    expect(discardRequests[0]?.data).toEqual({ itemId: 12 });
  });

  it('点击「刷新背包」经 WS 发出 item.inventory（带分页参数）', async () => {
    const harness = createPanelHarness();
    harness.render(<BagPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('bag-refresh'));

    const inventoryRequests = harness.requests.filter(
      (r) => r.cmd === ITEM_CMD.cmd && r.subCmd === ITEM_CMD.inventory,
    );
    expect(inventoryRequests).toHaveLength(1);
    expect(inventoryRequests[0]?.data).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('基底库计数与工具条按钮可访问', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.item.bases = [];
    });
    harness.render(<BagPanel />);

    expect(screen.getByTestId('bag-bases-count')).toHaveTextContent('基底 0 项');
    const section = screen.getByTestId('section-card-root');
    expect(within(section).getByRole('button', { name: '拉取基底库' })).toBeInTheDocument();
  });
});
