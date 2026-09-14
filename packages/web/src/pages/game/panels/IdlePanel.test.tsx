/**
 * IdlePanel（新版·玩法驱动）测试。
 * 重点：待结算时长/预计收益/日产出额度是否呈现、结算结果（含空分支）是否可读、
 * 协议字段（ISO 时间、字段名、通货 code）是否真的没上屏。
 * 常量一律从 transport 导入（不写字面量），交互用例必须先 `await harness.connect()`。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IDLE_CMD } from '@idle-path/ionet-transport';
import type {
  CurrencyView,
  IdleSettleData,
  IdleSettleEmptyData,
  IdleStatusData,
} from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { IdlePanel } from './IdlePanel.js';

function makeStatus(overrides: Partial<IdleStatusData> = {}): IdleStatusData {
  return {
    realm: 3,
    lastSettleAt: '2026-09-13T00:00:00.000Z',
    pendingHours: 4,
    effectiveHours: 2,
    estimatedKills: 120,
    estimatedLingyun: 340,
    dailyItemsProduced: 5,
    dailyItemCap: 200,
    config: { roundsPerHour: 60, efficiencyPct: 50, maxOfflineHours: 12 },
    ...overrides,
  };
}

function makeSettle(overrides: Partial<IdleSettleData> = {}): IdleSettleData {
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
    zone: { code: 'qingyun', name: '青云山', maxFloor: 3 },
    floors: [
      { floor: 1, unitCode: 'wolf', unitName: '灵狼', isBoss: false, kills: 4 },
      { floor: 2, unitCode: 'wolf', unitName: '灵狼', isBoss: false, kills: 3 },
      { floor: 3, unitCode: 'wolf_boss', unitName: '狼王', isBoss: true, kills: 1 },
    ],
    offlineHours: 3,
    effectiveHours: 1.5,
    dailyItemsProduced: 7,
    dailyItemCap: 200,
    ...overrides,
  } as IdleSettleData;
}

const EMPTY_SETTLE: IdleSettleEmptyData = {
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
  dailyItemsProduced: 5,
  dailyItemCap: 200,
};

function makeCurrency(overrides: Partial<CurrencyView> = {}): CurrencyView {
  return { id: 1, code: 'chaos', name: '混沌石', description: '', implemented: true, owned: 3, ...overrides };
}

type Req = { cmd: number; subCmd: number };
const isSettle = (r: Req) => r.cmd === IDLE_CMD.cmd && r.subCmd === IDLE_CMD.settle;
const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });

/** 挂机段假服务端：status / settle 都回成功体。 */
function idleHandler(request: Req) {
  if (request.cmd !== IDLE_CMD.cmd) return null;
  if (request.subCmd === IDLE_CMD.status) return ok(makeStatus());
  if (request.subCmd === IDLE_CMD.settle) return ok(makeSettle());
  return null;
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void, handler?: typeof idleHandler) {
  const harness = createPanelHarness(handler === undefined ? {} : { handler });
  harness.seed(() => {
    seedFn?.(harness.root);
  });
  return harness;
}

describe('IdlePanel · 离线收益与日产出（玩法信息）', () => {
  it('展示 待结算/有效时长、预计击杀/灵韵、日产出额度与挂机规则', () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus();
    });
    harness.render(<IdlePanel />);

    const stats = screen.getByTestId('idle-stats');
    expect(stats).toHaveTextContent('待结算时长');
    expect(stats).toHaveTextContent('4 小时');
    expect(stats).toHaveTextContent('有效时长');
    expect(stats).toHaveTextContent('2 小时');
    expect(stats).toHaveTextContent('预计击杀');
    expect(stats).toHaveTextContent('120');
    expect(stats).toHaveTextContent('预计灵韵');
    expect(stats).toHaveTextContent('340');

    expect(screen.getByTestId('idle-daily-bar')).toHaveTextContent('5 / 200');

    const rules = screen.getByTestId('idle-rules');
    expect(rules).toHaveTextContent('每轮 1 分');
    expect(rules).toHaveTextContent('50%');
    expect(rules).toHaveTextContent('12 小时');
  });

  it('边界：pendingHours=0 时显示「0 分」并提示暂无可结算收益', () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus({ pendingHours: 0, effectiveHours: 0, estimatedKills: 0, estimatedLingyun: 0 });
    });
    harness.render(<IdlePanel />);

    expect(screen.getByTestId('idle-stats')).toHaveTextContent('0 分');
    expect(screen.getByText('暂无可结算收益')).toBeInTheDocument();
  });

  it('status=null 且 lastSettle=null 时显示空态而非崩溃', () => {
    const harness = setup();
    harness.render(<IdlePanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无挂机数据')).toBeInTheDocument();
    expect(screen.queryByTestId('idle-stats')).toBeNull();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = setup((root) => {
      root.idle.loading = true;
    });
    const view = harness.render(<IdlePanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.idle.loading = false;
      harness.root.idle.error = '挂机状态加载失败';
    });
    harness.render(<IdlePanel />);
    expect(screen.getByText('挂机状态加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });
});

describe('IdlePanel · 结算动作与结果', () => {
  it('点「结算离线收益」先弹确认、再点确认才发出 idle.settle', async () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus();
    }, idleHandler);
    harness.render(<IdlePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('idle-settle'));
    expect(await screen.findByText('结算离线收益？')).toBeInTheDocument();
    expect(harness.requests.filter(isSettle)).toHaveLength(0);

    await userEvent.click(await screen.findByRole('button', { name: /确\s*认\s*结\s*算/ }));
    await waitFor(() => expect(harness.requests.filter(isSettle)).toHaveLength(1));
    expect(harness.requests.filter(isSettle)[0]?.data).toEqual({});
  });

  it('点「刷新挂机」经 WS 发出 idle.status', async () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus();
    }, idleHandler);
    harness.render(<IdlePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('idle-refresh'));
    await waitFor(() =>
      expect(
        harness.requests.some((r) => r.cmd === IDLE_CMD.cmd && r.subCmd === IDLE_CMD.status),
      ).toBe(true),
    );
  });

  it('lastSettle 正常分支展示逐层战果、秘境、时长与产出摘要（§23 A3 整轮）', () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus();
      root.idle.lastSettle = makeSettle();
    });
    harness.render(<IdlePanel />);

    const settlement = screen.getByTestId('idle-settlement');
    expect(settlement).toHaveTextContent('青云山');
    expect(settlement).toHaveTextContent('3 层');
    expect(settlement).toHaveTextContent('击杀 8');
    expect(settlement).toHaveTextContent('3 小时');
    expect(settlement).toHaveTextContent('1 小时 30 分');
    expect(settlement).toHaveTextContent('7 / 200');
    expect(settlement).toHaveTextContent('保留物品');
    expect(settlement).toHaveTextContent('1 件');
    expect(screen.getByTestId('settlement-lingyun')).toHaveTextContent('+20');

    // §23 A3：逐层清单（第 N 层 · 单位 ×击杀），Boss 层有标注
    const floors = screen.getByTestId('idle-floor-list');
    expect(floors).toHaveTextContent('第 1 层');
    expect(floors).toHaveTextContent('灵狼 ×4');
    expect(floors).toHaveTextContent('第 3 层（Boss）');
    expect(floors).toHaveTextContent('狼王 ×1');
  });

  it('lastSettle 空结算分支（kills === 0）正常显示且不当作错误', () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus({ pendingHours: 0 });
      root.idle.lastSettle = EMPTY_SETTLE;
    });
    harness.render(<IdlePanel />);

    expect(screen.getByTestId('idle-settlement-empty')).toBeInTheDocument();
    const settlement = screen.getByTestId('idle-settlement');
    expect(settlement).toHaveTextContent('暂无可结算收益');
    expect(settlement).toHaveTextContent('0 件');
    expect(screen.queryByTestId('idle-floor-list')).toBeNull();
    expect(screen.queryByTestId('async-boundary-error')).toBeNull();
  });

  it('调试单单位结算（floors 为空、zone 为 null）不渲染逐层清单、也不崩', () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus();
      root.idle.lastSettle = makeSettle({ zone: null, floors: [] });
    });
    harness.render(<IdlePanel />);

    expect(screen.getByTestId('idle-settlement')).toHaveTextContent('击杀 8');
    expect(screen.queryByTestId('idle-floor-list')).toBeNull();
  });
});

describe('IdlePanel · 协议字段不上屏', () => {
  it('不展示 lastSettleAt 的 ISO 原文与 DTO 字段名，通货 code 降级为占位名', () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus();
      root.idle.lastSettle = makeSettle({ currencies: { chaos: 2 } });
    });
    harness.render(<IdlePanel />);

    const text = document.body.textContent ?? '';
    for (const leaked of [
      'lastSettleAt',
      'T00:00:00',
      'pendingHours',
      'effectiveHours',
      'dailyItemsProduced',
      'roundsPerHour',
      'efficiencyPct',
      'maxOfflineHours',
      'chaos',
    ]) {
      expect(text).not.toContain(leaked);
    }
    expect(text).toContain('未知掉落');
  });

  it('通货 code 在能查到中文名时展示中文名', () => {
    const harness = setup((root) => {
      root.idle.status = makeStatus();
      root.idle.lastSettle = makeSettle({ currencies: { chaos: 2 } });
      root.economy.currencies = [makeCurrency()];
    });
    harness.render(<IdlePanel />);

    expect(screen.getByTestId('settlement-resources')).toHaveTextContent('混沌石 ×2');
    expect(document.body.textContent ?? '').not.toContain('chaos');
  });
});
