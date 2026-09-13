/**
 * IdlePanel 测试：展示态用 `harness.seed()`；结算属 ConfirmAction，断言「先弹确认、再点确认」两步。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IDLE_CMD } from '@idle-path/ionet-transport';
import type { IdleSettleData, IdleSettleEmptyData, IdleStatusData } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { IdlePanel } from './IdlePanel.js';

function makeStatus(overrides: Partial<IdleStatusData> = {}): IdleStatusData {
  return {
    realm: 3, lastSettleAt: '2026-09-13T00:00:00.000Z', pendingHours: 4, effectiveHours: 2,
    estimatedKills: 120, estimatedLingyun: 340, dailyItemsProduced: 5, dailyItemCap: 200,
    config: { roundsPerHour: 60, efficiencyPct: 50, maxOfflineHours: 12 },
    ...overrides,
  };
}

function makeSettle(overrides: Partial<IdleSettleData> = {}): IdleSettleData {
  return {
    unit: { code: 'wolf', name: '灵狼', realm: 1 }, kills: 8, lingyunGained: 20, lingyunTotal: 100,
    items: [], kept: 1, salvaged: { count: 0, lingyun: 0 }, sold: { count: 0, spiritStones: 0 },
    discarded: 0, blockedByTier: 0, currencies: {}, essences: {}, itemsProduced: 2,
    zone: { code: 'qingyun', name: '青云山', floor: 1, isBoss: false }, offlineHours: 3,
    effectiveHours: 1.5, dailyItemsProduced: 7, dailyItemCap: 200,
    ...overrides,
  };
}

const EMPTY_SETTLE: IdleSettleEmptyData = {
  unit: null, offlineHours: 0, effectiveHours: 0, kills: 0, lingyunGained: 0, lingyunTotal: 0,
  items: [], kept: 0, salvaged: { count: 0, lingyun: 0 }, sold: { count: 0, spiritStones: 0 },
  discarded: 0, blockedByTier: 0, currencies: {}, essences: {}, itemsProduced: 0,
  dailyItemsProduced: 5, dailyItemCap: 200,
};

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

describe('IdlePanel', () => {
  it('渲染挂机统计与日产出资源条', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.idle.status = makeStatus();
    });
    harness.render(<IdlePanel />);

    expect(screen.getByText('待结算时长')).toBeInTheDocument();
    expect(screen.getByText('有效时长')).toBeInTheDocument();
    expect(screen.getByText('预计击杀')).toBeInTheDocument();
    expect(screen.getByText('预计灵韵')).toBeInTheDocument();
    expect(screen.getByText('今日物品产出')).toBeInTheDocument();
    expect(screen.getByText(/5\/200/)).toBeInTheDocument();
    expect(screen.getByTestId('idle-config')).toHaveTextContent('效率 50%');
  });

  it('status 与 lastSettle 均为 null 时显示空态而非崩溃', () => {
    const harness = createPanelHarness();
    harness.render(<IdlePanel />);

    expect(screen.getByText('未加载挂机状态')).toBeInTheDocument();
    expect(screen.getByText('暂无挂机数据')).toBeInTheDocument();
    expect(screen.getByTestId('idle-config')).toHaveTextContent('效率 0%');
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.idle.loading = true;
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

  it('lastSettle 正常分支展示关键字段', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.idle.status = makeStatus();
      harness.root.idle.lastSettle = makeSettle();
    });
    harness.render(<IdlePanel />);

    const list = screen.getByTestId('key-value-list-root');
    expect(within(list).getByText('灵狼')).toBeInTheDocument();
    expect(within(list).getByText('3 小时')).toBeInTheDocument();
    expect(within(list).getByText('8')).toBeInTheDocument();
    expect(within(list).getByText('20')).toBeInTheDocument();
    expect(within(list).getByText('2')).toBeInTheDocument();
  });

  it('lastSettle 空结算分支（unit === null）也能显示', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.idle.status = makeStatus();
      harness.root.idle.lastSettle = EMPTY_SETTLE;
    });
    harness.render(<IdlePanel />);

    const list = screen.getByTestId('key-value-list-root');
    expect(within(list).getByText('无可结算')).toBeInTheDocument();
    expect(within(list).getByText('0 小时')).toBeInTheDocument();
  });

  it('点击「结算离线收益」先弹确认、再点确认才发出 idle.settle', async () => {
    const harness = createPanelHarness({ handler: idleHandler });
    harness.seed(() => {
      harness.root.idle.status = makeStatus();
    });
    harness.render(<IdlePanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('idle-settle'));
    expect(await screen.findByText('确认结算离线收益？')).toBeInTheDocument();
    expect(harness.requests.filter(isSettle)).toHaveLength(0);

    await userEvent.click(screen.getByText('确认结算'));
    await waitFor(() => expect(harness.requests.filter(isSettle)).toHaveLength(1));
    expect(harness.requests.filter(isSettle)[0]?.data).toEqual({});
  });
});
