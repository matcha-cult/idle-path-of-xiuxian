/**
 * EquipPanel（新版·玩法驱动）测试。
 * 覆盖：十槽位总览与空槽 / 三态 / 候选筛选与门槛提示 / 交互真发请求（常量取自 transport）/
 * 边界（全 null 槽位、越界阶数）/ 协议字段与 ISO 时间串不上屏。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  EQUIP_CMD,
  EQUIP_SLOT_KEYS,
  ITEM_CMD,
  REALMS,
  type AffixView,
  type Character,
  type EquippedSlotView,
  type ItemView,
} from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { EquipPanel } from './EquipPanel.js';

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

function makeSlot(overrides: Partial<EquippedSlotView> = {}): EquippedSlotView {
  return { id: 21, name: '青锋剑', rarity: 1, tier: 3, ...overrides };
}

function makeAffix(overrides: Partial<AffixView> = {}): AffixView {
  return {
    affixId: 7,
    value: 12,
    polarity: 'suffix',
    key: 'atk',
    code: 'aff_atk_1',
    name: '锐锋',
    tier: 2,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: 31,
    baseId: 1,
    baseCode: 'sword_1',
    name: '玄铁剑',
    category: 'weapon',
    slot: 'weapon',
    rarity: 2,
    rarityName: '宝品',
    tier: 4,
    quality: 0,
    status: 'bag',
    affixTexts: ['攻击 +9'],
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

/** 按槽位 key 取 SlotBoard 中的槽位卡（SlotBoard 无法按 key 查询 testid）。 */
function slot(key: string): HTMLElement {
  const found = screen.getAllByTestId('slot-board-slot').find((el) => el.getAttribute('data-slot-key') === key);
  if (found === undefined) throw new Error(`未找到槽位 ${key}`);
  return found;
}

describe('EquipPanel · 十槽位总览', () => {
  it('渲染已装备槽位的名称/T 阶/稀有度，空槽显示「未装备」，顶部统计齐全', () => {
    const harness = setup((root) => {
      root.equip.slots = { weapon: makeSlot() };
      root.equip.equippedCount = 1;
    });
    harness.render(<EquipPanel />);

    const weapon = slot('weapon');
    expect(within(weapon).getByText('青锋剑')).toBeInTheDocument();
    expect(within(weapon).getByText('T3')).toBeInTheDocument();
    expect(within(weapon).getByText('灵品')).toBeInTheDocument();
    expect(screen.getAllByText('未装备')).toHaveLength(EQUIP_SLOT_KEYS.length - 1);

    const stats = screen.getByTestId('equip-stats');
    expect(stats).toHaveTextContent(`1 / ${EQUIP_SLOT_KEYS.length}`);
    expect(stats).toHaveTextContent(REALMS[4] ?? '');
    expect(stats).toHaveTextContent('T5');
    expect(stats).toHaveTextContent('空槽位');
  });

  it('空态：slots 为空对象时走 AsyncBoundary 空态文案', () => {
    const harness = setup();
    harness.render(<EquipPanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText('装备栏暂无数据')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = setup((root) => {
      root.equip.loading = true;
    });
    const view = harness.render(<EquipPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.equip.loading = false;
      harness.root.equip.error = '装备栏加载失败';
    });
    harness.render(<EquipPanel />);
    expect(screen.getByText('装备栏加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('边界：十个槽位全 null 时逐槽显示「未装备」且不进空态', () => {
    const harness = setup((root) => {
      root.equip.slots = Object.fromEntries(EQUIP_SLOT_KEYS.map((key) => [key, null]));
      root.equip.equippedCount = 0;
    });
    harness.render(<EquipPanel />);

    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('slot-board-slot')).toHaveLength(EQUIP_SLOT_KEYS.length);
    expect(screen.getAllByText('未装备')).toHaveLength(EQUIP_SLOT_KEYS.length);
  });
});

describe('EquipPanel · 动作（真发请求）', () => {
  it('点「卸下」确认后经 WS 发出 equip.unequip（itemId 正确）', async () => {
    const harness = setup((root) => {
      root.equip.slots = { weapon: makeSlot({ id: 21 }) };
      root.equip.equippedCount = 1;
    });
    harness.render(<EquipPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('equip-unequip-weapon'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() => {
      const requests = harness.requests.filter((r) => r.cmd === EQUIP_CMD.cmd && r.subCmd === EQUIP_CMD.unequip);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.data).toEqual({ itemId: 21 });
    });
  });

  it('点「刷新装备栏」经 WS 发出 equip.equipment', async () => {
    const harness = setup((root) => {
      root.equip.slots = { weapon: makeSlot() };
      root.equip.equippedCount = 1;
    });
    harness.render(<EquipPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('equip-refresh'));

    await waitFor(() =>
      expect(
        harness.requests.some((r) => r.cmd === EQUIP_CMD.cmd && r.subCmd === EQUIP_CMD.equipment),
      ).toBe(true),
    );
  });

  it('点槽位后只列出同部位、未装备的候选；换装经 WS 发出 equip.equip', async () => {
    const harness = setup((root) => {
      root.equip.slots = { weapon: makeSlot() };
      root.equip.equippedCount = 1;
      root.item.items = [
        makeItem({ id: 31, slot: 'weapon' }),
        makeItem({ id: 32, name: '旧铁剑', slot: 'weapon', status: 'equipped' }),
        makeItem({ id: 33, name: '玄铁甲', category: 'body', slot: 'body' }),
      ];
      root.item.total = 3;
    });
    harness.render(<EquipPanel />);
    await harness.connect();

    await userEvent.click(slot('weapon'));

    const candidates = screen.getByTestId('equip-candidates');
    expect(within(candidates).getByTestId('equip-candidate-31')).toBeInTheDocument();
    expect(within(candidates).queryByTestId('equip-candidate-32')).toBeNull();
    expect(within(candidates).queryByTestId('equip-candidate-33')).toBeNull();

    await userEvent.click(screen.getByTestId('equip-candidate-equip-31'));
    await waitFor(() => {
      const requests = harness.requests.filter((r) => r.cmd === EQUIP_CMD.cmd && r.subCmd === EQUIP_CMD.equip);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.data).toEqual({ itemId: 31 });
    });
  });

  it('点「详情」经 WS 发出 item.inventoryDetail', async () => {
    const harness = setup((root) => {
      root.equip.slots = { weapon: makeSlot() };
      root.equip.equippedCount = 1;
      root.item.items = [makeItem({ id: 31 })];
      root.item.total = 1;
    });
    harness.render(<EquipPanel />);
    await harness.connect();

    await userEvent.click(slot('weapon'));
    await userEvent.click(screen.getByTestId('equip-candidate-detail-31'));

    await waitFor(() => {
      const requests = harness.requests.filter(
        (r) => r.cmd === ITEM_CMD.cmd && r.subCmd === ITEM_CMD.inventoryDetail,
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]?.data).toEqual({ id: 31 });
    });
  });
});

describe('EquipPanel · 门槛与协议字段', () => {
  it('超阶候选显示 LockedHint 门槛提示且不提供装备入口', async () => {
    const harness = setup((root) => {
      root.session.character = makeCharacter({ realm: 2 });
      root.equip.slots = Object.fromEntries(EQUIP_SLOT_KEYS.map((key) => [key, null]));
      root.item.items = [makeItem({ id: 41, tier: 9 })];
      root.item.total = 1;
    });
    harness.render(<EquipPanel />);

    await userEvent.click(slot('weapon'));

    const candidate = screen.getByTestId('equip-candidate-41');
    expect(within(candidate).getByTestId('locked-hint-root')).toHaveTextContent('境界不足');
    expect(within(candidate).getByTestId('locked-hint-requirement')).toHaveTextContent('需要 9 · 当前 2');
    expect(within(candidate).queryByTestId('equip-candidate-equip-41')).toBeNull();
  });

  it('详情区用 AffixList 展示完整词条（T 阶 / 天定），协议字段与 ISO 串不上屏', async () => {
    const harness = setup((root) => {
      root.equip.slots = { weapon: makeSlot() };
      root.equip.equippedCount = 1;
      root.item.items = [makeItem({ id: 31, createdAt: '2026-09-13T10:00:00.000Z' })];
      root.item.total = 1;
      root.item.detail = makeItem({
        affixes: [makeAffix({ fractured: true })],
        createdAt: '2026-09-13T10:00:00.000Z',
      });
    });
    harness.render(<EquipPanel />);

    const detail = screen.getByTestId('equip-detail');
    expect(detail).toHaveTextContent('锐锋');
    expect(detail).toHaveTextContent('T2');
    expect(detail).toHaveTextContent('天定');

    const text = document.body.textContent ?? '';
    for (const leaked of ['sword_1', 'baseCode', 'affixId', 'aff_atk_1', 'createdAt', '2026-09-13', 'equippedCount', 'ring1']) {
      expect(text).not.toContain(leaked);
    }
  });
});
