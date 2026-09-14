/**
 * IdleStore · §23 B2 自动结算（上线 / 建角 / 进面板各一次，战斗中静默跳过）。
 *
 * 这一组用例锁死三条纪律（`23-挂机开发交接.md` §3.6）：
 * 1. **静默**：自动结算不弹提示、不写 `error`、不动 `loading` —— 否则每次上线都弹一条
 *    红色「在线战斗中」或灰色「暂无可结算收益」；
 * 2. **幂等**：一次会话只自动尝试一次；成功 / 空 / 其他失败都算有结论，不再重复调用；
 * 3. **可补做**：被状态闸门挡下（在线战斗中 / 尚未建角）时不落结论，等下一个触发点再试。
 *
 * 夹具注意：`settle` 成功后会再 `await load({quiet})` 拉一次 `idle.status`，
 * 所以假服务端必须把 `status` 也答成成功，否则会多推一条错误 Toast 干扰断言。
 */
import { describe, expect, it } from 'vitest';
import { IDLE_CMD } from '@idle-path/ionet-transport';
import type { IdleSettleData, IdleSettleEmptyData, IdleStatusData } from '@idle-path/ionet-transport';
import { businessFail } from '@idle-path/ionet-transport/testing';
import { createPanelHarness, type PanelHarness } from '../helpers/panel-harness.js';

const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });

function makeStatus(): IdleStatusData {
  return {
    realm: 3,
    lastSettleAt: '2026-09-13T00:00:00.000Z',
    pendingHours: 4,
    effectiveHours: 2,
    estimatedKills: 120,
    estimatedLingyun: 340,
    dailyItemsProduced: 5,
    dailyItemCap: 200,
    config: { roundsPerHour: 60, efficiencyPct: 60, maxOfflineHours: 12 },
  };
}

function makeSettle(kills = 8): IdleSettleData {
  return {
    kills,
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
    zone: { code: 'zone_r4', name: '落霞谷', maxFloor: 3 },
    floors: [{ floor: 1, unitCode: 'u_r4', unitName: '灵狼', isBoss: false, kills }],
    offlineHours: 3,
    effectiveHours: 1.5,
    dailyItemsProduced: 7,
    dailyItemCap: 200,
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

/** 假服务端的结算应答模式（用可变闭包切换，模拟「战斗中 → 离开战斗」）。 */
type SettleMode = 'ok' | 'empty' | 'battle' | 'charMissing' | 'invalid' | 'noData';

function makeHarness(getMode: () => SettleMode, options: { delayMs?: number } = {}): PanelHarness {
  return createPanelHarness({
    handler: (request) => {
      if (request.cmd !== IDLE_CMD.cmd) return { data: businessFail('CHARACTER_NOT_FOUND', '尚未创建角色') };
      if (request.subCmd === IDLE_CMD.status) return ok(makeStatus());
      if (request.subCmd !== IDLE_CMD.settle) return { data: businessFail('CHARACTER_NOT_FOUND', '尚未创建角色') };
      const reply =
        getMode() === 'ok'
          ? ok(makeSettle())
          : getMode() === 'empty'
            ? ok(EMPTY_SETTLE)
            : getMode() === 'noData'
              ? ok(undefined)
              : getMode() === 'battle'
                ? { data: businessFail('ONLINE_BATTLE_ACTIVE', '在线战斗中，离线挂机已暂停（离开秘境后恢复）') }
                : getMode() === 'charMissing'
                  ? { data: businessFail('CHARACTER_NOT_FOUND', '尚未创建角色') }
                  : { data: businessFail('INVALID_PARAM', 'hours 不合法') };
      return options.delayMs === undefined ? reply : { ...reply, delayMs: options.delayMs };
    },
  });
}

const isSettle = (request: { cmd: number; subCmd: number }) =>
  request.cmd === IDLE_CMD.cmd && request.subCmd === IDLE_CMD.settle;

const settleCalls = (harness: PanelHarness) => harness.requests.filter(isSettle);
const toastTitles = (harness: PanelHarness) => harness.root.toast.toasts.map((item) => item.title);

// ===== settle：静默模式 =====

describe('IdleStore.settle · 静默模式（B2 用）', () => {
  it('战斗中：静默 -> 不弹提示、不写 error，返回 blocked', async () => {
    const harness = makeHarness(() => 'battle');
    await harness.connect();
    const outcome = await harness.root.idle.settle(undefined, { silent: true });

    expect(outcome).toBe('blocked');
    expect(harness.root.idle.error).toBeNull();
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('战斗中：非静默（玩家手动点结算）仍写 error + 弹业务码提示', async () => {
    const harness = makeHarness(() => 'battle');
    await harness.connect();
    const outcome = await harness.root.idle.settle();

    expect(outcome).toBe('blocked');
    expect(harness.root.idle.error).toContain('在线战斗中');
    expect(harness.root.toast.toasts.length).toBeGreaterThan(0);
  });

  it('成功：静默 -> 写 lastSettle、刷新 status，但不弹提示、loading 全程为 false', async () => {
    const harness = makeHarness(() => 'ok');
    await harness.connect();
    const idle = harness.root.idle;
    const promise = idle.settle(undefined, { silent: true });
    expect(idle.loading).toBe(false);
    const outcome = await promise;

    expect(outcome).toBe('settled');
    expect(idle.lastSettle?.kills).toBe(8);
    expect(idle.status?.dailyItemCap).toBe(200);
    expect(idle.loading).toBe(false);
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('空分支（kills=0）：静默 -> 返回 empty 且不弹「暂无可结算收益」', async () => {
    const harness = makeHarness(() => 'empty');
    await harness.connect();
    const outcome = await harness.root.idle.settle(undefined, { silent: true });

    expect(outcome).toBe('empty');
    expect(harness.root.idle.lastSettle?.kills).toBe(0);
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('非静默空分支：返回 empty 并弹「暂无可结算收益」（预期分支，不是错误）', async () => {
    const harness = makeHarness(() => 'empty');
    await harness.connect();
    const outcome = await harness.root.idle.settle();

    expect(outcome).toBe('empty');
    expect(toastTitles(harness)).toContain('暂无可结算收益');
    expect(harness.root.idle.error).toBeNull();
  });

  it('其他业务失败（INVALID_PARAM）：静默 -> failed，不弹不写', async () => {
    const harness = makeHarness(() => 'invalid');
    await harness.connect();
    const outcome = await harness.root.idle.settle(undefined, { silent: true });

    expect(outcome).toBe('failed');
    expect(harness.root.idle.error).toBeNull();
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('响应缺 data（异常路径）：静默 -> failed 且不抛、不弹、不写 error', async () => {
    const harness = makeHarness(() => 'noData');
    await harness.connect();

    const outcome = await harness.root.idle.settle(undefined, { silent: true });
    expect(outcome).toBe('failed');
    expect(harness.root.idle.error).toBeNull();
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('响应缺 data（异常路径）：非静默仍写 error + 弹提示', async () => {
    const harness = makeHarness(() => 'noData');
    await harness.connect();

    const outcome = await harness.root.idle.settle();
    expect(outcome).toBe('failed');
    expect(harness.root.idle.error).toContain('挂机结算响应缺少 data');
    expect(harness.root.toast.toasts.length).toBeGreaterThan(0);
  });
});

// ===== autoSettle：幂等 / 静默 / 可补做 =====

describe('IdleStore.autoSettle · 幂等与补做（B2）', () => {
  it('成功结算一次后，再调用不再发请求（一次会话只自动尝试一次）', async () => {
    const harness = makeHarness(() => 'ok');
    await harness.connect();

    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(1);
    expect(harness.root.idle.lastSettle?.kills).toBe(8);

    await harness.root.idle.autoSettle();
    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(1);
  });

  it('空结算也算有结论：不再重复尝试（不刷「暂无可结算收益」）', async () => {
    const harness = makeHarness(() => 'empty');
    await harness.connect();
    await harness.root.idle.autoSettle();
    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(1);
  });

  it('战斗中 -> blocked 不落结论；离开战斗（闸门放开）后补做成功', async () => {
    let mode: SettleMode = 'battle';
    const harness = makeHarness(() => mode);
    await harness.connect();

    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(1);
    expect(harness.root.idle.lastSettle).toBeNull();
    expect(harness.root.toast.toasts).toHaveLength(0);

    mode = 'ok';
    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(2);
    expect(harness.root.idle.lastSettle?.kills).toBe(8);

    mode = 'battle';
    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(2);
  });

  it('尚未建角（CHARACTER_NOT_FOUND）也不落结论：建角后能补做', async () => {
    let mode: SettleMode = 'charMissing';
    const harness = makeHarness(() => mode);
    await harness.connect();

    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(1);

    mode = 'ok';
    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(2);
  });

  it('其他失败（非闸门）不重试：一次会话就此收摊', async () => {
    let mode: SettleMode = 'invalid';
    const harness = makeHarness(() => mode);
    await harness.connect();

    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(1);

    mode = 'ok';
    await harness.root.idle.autoSettle();
    expect(settleCalls(harness)).toHaveLength(1);
  });

  it('并发调用（面板挂载 + loadPanel 几乎同时）只发一次请求', async () => {
    const harness = makeHarness(() => 'ok', { delayMs: 20 });
    await harness.connect();

    await Promise.all([harness.root.idle.autoSettle(), harness.root.idle.autoSettle(), harness.root.idle.autoSettle()]);
    expect(settleCalls(harness)).toHaveLength(1);
  });
});

// ===== 触发点 =====

describe('RootStore.loadPanel · B2 触发点', () => {
  it('loadPanel 后自动结算一次；再次 loadPanel（全量刷新）不再重复', async () => {
    const harness = makeHarness(() => 'ok');
    await harness.connect();

    await harness.root.loadPanel();
    expect(settleCalls(harness)).toHaveLength(1);

    await harness.root.loadPanel();
    expect(settleCalls(harness)).toHaveLength(1);
  });

  it('战斗中 loadPanel：静默跳过（无提示、无 error），且下次 loadPanel 会补做', async () => {
    let mode: SettleMode = 'battle';
    const harness = makeHarness(() => mode);
    await harness.connect();

    await harness.root.loadPanel();
    expect(harness.root.idle.error ?? '').not.toContain('在线战斗中');
    // 面板其余域的失败提示不受影响，但**不能**出现自动结算的「在线战斗中」提示
    const texts = harness.root.toast.toasts.map((item) => `${item.title} ${item.message ?? ''}`);
    expect(texts.some((text) => text.includes('在线战斗中'))).toBe(false);

    mode = 'ok';
    await harness.root.loadPanel();
    expect(settleCalls(harness)).toHaveLength(2);
  });
});
