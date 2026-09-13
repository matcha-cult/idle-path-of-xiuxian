/**
 * EquipPanel 测试：展示 / 三态 / 交互（真发请求）/ 边界。
 * 交互用例必须先 `await harness.connect()`，否则请求停在「等待连接就绪」。
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EQUIP_CMD } from '@idle-path/ionet-transport';
import type { EquippedSlotView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { EquipPanel } from './EquipPanel.js';

function makeSlot(overrides: Partial<EquippedSlotView> = {}): EquippedSlotView {
  return { id: 21, name: '青锋剑', rarity: 1, tier: 3, ...overrides };
}

describe('EquipPanel', () => {
  it('渲染已装备槽位：名称 / 稀有度 / 阶，其余槽位显示「空」', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.equip.slots = { weapon: makeSlot() };
      harness.root.equip.equippedCount = 1;
    });
    harness.render(<EquipPanel />);

    const weapon = screen.getByTestId('equip-slot-weapon');
    expect(within(weapon).getByText('青锋剑')).toBeInTheDocument();
    expect(within(weapon).getByText('灵品')).toBeInTheDocument();
    expect(within(weapon).getByText('T3')).toBeInTheDocument();
    expect(screen.getByTestId('equip-equipped-count')).toHaveTextContent('已装备 1 件');
    expect(screen.getAllByText('空')).toHaveLength(9);
  });

  it('空态：slots 为空对象时走 AsyncBoundary 空态文案', () => {
    const harness = createPanelHarness();
    harness.render(<EquipPanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText('装备栏暂无数据')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.equip.loading = true;
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

  it('点「卸下」→ 确认后经 WS 发出 equip.unequip（itemId 正确）', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.equip.slots = { weapon: makeSlot({ id: 21 }) };
      harness.root.equip.equippedCount = 1;
    });
    harness.render(<EquipPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('equip-unequip-weapon'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    const requests = harness.requests.filter(
      (r) => r.cmd === EQUIP_CMD.cmd && r.subCmd === EQUIP_CMD.unequip,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({ itemId: 21 });
  }, 20000);

  it('点「刷新装备栏」经 WS 发出 equip.equipment', async () => {
    const harness = createPanelHarness();
    harness.render(<EquipPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('equip-refresh'));

    const requests = harness.requests.filter(
      (r) => r.cmd === EQUIP_CMD.cmd && r.subCmd === EQUIP_CMD.equipment,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({});
  }, 20000);

  it('边界：十个槽位键值全为 null 时不崩，逐槽显示「空」且不进空态', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.equip.slots = {
        weapon: null,
        body: null,
        helmet: null,
        gloves: null,
        boots: null,
        shield: null,
        ring1: null,
        ring2: null,
        amulet: null,
        belt: null,
      };
      harness.root.equip.equippedCount = 0;
    });
    harness.render(<EquipPanel />);

    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
    expect(screen.getAllByText('空')).toHaveLength(10);
    expect(screen.getByTestId('equip-equipped-count')).toHaveTextContent('已装备 0 件');
  });
});
