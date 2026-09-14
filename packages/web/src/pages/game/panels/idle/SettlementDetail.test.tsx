/**
 * SettlementDetail 测试（§23 A3 整轮结算展示）。
 *
 * 重点：逐层清单可读、空分支不是错误、协议字段（unitCode / code）不上屏。
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IdleSettleData, IdleSettleEmptyData } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../../test/helpers/panel-harness.js';
import { SettlementDetail } from './SettlementDetail.js';

function data(overrides: Partial<IdleSettleData> = {}): IdleSettleData {
  return {
    kills: 8,
    lingyunGained: 20,
    lingyunTotal: 100,
    items: [],
    kept: 1,
    salvaged: { count: 0, lingyun: 0 },
    sold: { count: 0, spiritStones: 0 },
    discarded: 0,
    blockedByTier: 0,
    currencies: {},
    essences: {},
    itemsProduced: 2,
    zone: { code: 'zone_r4', name: '青云山', maxFloor: 3 },
    floors: [
      { floor: 1, unitCode: 'u_r4_wolf', unitName: '灵狼', isBoss: false, kills: 4 },
      { floor: 3, unitCode: 'u_r4_boss', unitName: '狼王', isBoss: true, kills: 4 },
    ],
    offlineHours: 3,
    effectiveHours: 1.5,
    dailyItemsProduced: 7,
    dailyItemCap: 200,
    ...overrides,
  } as IdleSettleData;
}

const EMPTY: IdleSettleEmptyData = {
  zone: null,
  floors: [],
  offlineHours: 0,
  effectiveHours: 0,
  kills: 0,
  lingyunGained: 0,
  lingyunTotal: 0,
  items: [],
  kept: 0,
  salvaged: { count: 0, lingyun: 0 },
  sold: { count: 0, spiritStones: 0 },
  discarded: 0,
  blockedByTier: 0,
  currencies: {},
  essences: {},
  itemsProduced: 0,
  dailyItemsProduced: 0,
  dailyItemCap: 200,
};

function render(last: IdleSettleData | IdleSettleEmptyData) {
  const harness = createPanelHarness();
  harness.render(<SettlementDetail last={last} currencies={[]} essences={[]} />);
  return harness;
}

describe('SettlementDetail', () => {
  it('整轮结算：标题给秘境/层数/击杀，逐层清单列出每层单位', () => {
    render(data());
    const root = screen.getByTestId('idle-settlement');
    expect(root).toHaveTextContent('青云山 · 2 层 · 击杀 8');
    const floors = screen.getByTestId('idle-floor-list');
    expect(floors).toHaveTextContent('第 1 层');
    expect(floors).toHaveTextContent('灵狼 ×4');
    expect(floors).toHaveTextContent('第 3 层（Boss）');
    expect(floors).toHaveTextContent('狼王 ×4');
    expect(screen.getByTestId('settlement-lingyun')).toHaveTextContent('+20');
  });

  it('空分支（kills=0）：给说明文案、不渲染逐层清单、不是错误', () => {
    render(EMPTY);
    expect(screen.getByTestId('idle-settlement-empty')).toHaveTextContent('新收益会继续累积');
    expect(screen.queryByTestId('idle-floor-list')).toBeNull();
  });

  it('协议字段不上屏：unitCode / code / 字段名都不出现', () => {
    render(data({ currencies: { chaos: 1 } }));
    const text = document.body.textContent ?? '';
    for (const leaked of ['u_r4_wolf', 'u_r4_boss', 'zone_r4', 'unitCode', 'maxFloor', 'dailyItemsProduced', 'chaos']) {
      expect(text).not.toContain(leaked);
    }
    expect(text).toContain('未知掉落');
  });

  it('边界：floors 为空（调试单单位）时标题退化为击杀数且不渲染逐层段', () => {
    render(data({ floors: [], zone: null }));
    expect(screen.getByTestId('idle-settlement')).toHaveTextContent('击杀 8');
    expect(screen.queryByTestId('idle-floor-list')).toBeNull();
  });
});
