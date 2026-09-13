/**
 * EconomyStore · dev 注入提示**绝不上屏协议 code**。
 *
 * 契约来源：`10-玩法驱动的面板设计.md` §4「协议字段不上屏」——`code` 只能做 key / testid。
 * 这条约束对 **Toast 同样成立**：原实现把 `data.code` 直接拼进提示（玩家看到的是 `chaos → 5`），
 * 是全站唯一漏到玩家眼前的协议码。`grantCurrency` / `grantEssence` 现在都经目录查表转中文名。
 *
 * 边界口径（必须锁死）：
 * - 目录里查得到 → 用中文名；
 * - 目录里查不到（未加载 / 脏 code）→ 退化为类别名（「该通货」「该精华」），**仍然不回显 code**；
 * - 任何分支都不得让 code 出现在 title 或 message 里。
 *
 * 夹具注意：`grantCurrency` / `grantEssence` 成功后**还会 `await this.load()`**，
 * 所以假服务端必须把 `currencies` / `essences` 两个读子命令也答成成功，
 * 否则 `load()` 会再推一条错误 Toast，把「注入成功」那条挤掉（断言会打到错误的 Toast 上）。
 */
import { describe, expect, it } from 'vitest';
import { ECONOMY_CMD } from '@idle-path/ionet-transport';
import { businessFail } from '@idle-path/ionet-transport/testing';
import { createPanelHarness, type PanelHarness } from '../helpers/panel-harness.js';

const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });
const fail = () => ({ data: businessFail('CHARACTER_NOT_FOUND', '尚未创建角色') });

const CHAOS = {
  id: 1,
  code: 'chaos',
  name: '混沌石',
  description: '',
  implemented: true,
  owned: 3,
};

const ESS_ATK = {
  id: 7,
  code: 'ess_atk',
  name: '锋芒精华',
  polarity: 'prefix',
  targetFamily: 'weapon',
  description: '',
  owned: 0,
};

interface StubOptions {
  /** 要让其成功的注入子命令。 */
  subCmd: number;
  /** 该子命令的成功 data。 */
  payload: unknown;
  /** 目录（`load()` 会读它；空数组 = 目录里查不到该 code）。 */
  currencies?: readonly unknown[];
  essences?: readonly unknown[];
}

function makeHarness(options: StubOptions): PanelHarness {
  return createPanelHarness({
    handler: (request) => {
      if (request.cmd !== ECONOMY_CMD.cmd) return fail();
      if (request.subCmd === options.subCmd) return ok(options.payload);
      if (request.subCmd === ECONOMY_CMD.currencies) return ok({ currencies: options.currencies ?? [] });
      if (request.subCmd === ECONOMY_CMD.essences) return ok({ essences: options.essences ?? [] });
      return fail();
    },
  });
}

/** 按标题取 Toast：成功后紧跟的 `load()` 可能再推别的 Toast，不能只看最后一条。 */
function toastTitled(harness: PanelHarness, title: string): { title: string; message?: string } {
  const toast = harness.root.toast.toasts.find((item) => item.title === title);
  if (toast === undefined) {
    throw new Error(`没有找到标题为「${title}」的 Toast：${JSON.stringify(harness.root.toast.toasts)}`);
  }
  return toast;
}

describe('EconomyStore · dev 注入提示不上屏协议 code', () => {
  it('通货：目录查得到 → 提示用中文名', async () => {
    const harness = makeHarness({
      subCmd: ECONOMY_CMD.currencyGrant,
      payload: { code: 'chaos', amount: 5 },
      currencies: [CHAOS],
    });
    await harness.connect();
    // 真机顺序：首屏 `loadPanel()` 先把通货目录拉下来，玩家此时才可能点「注入」
    await harness.root.economy.load();

    await harness.root.economy.grantCurrency({ code: 'chaos', count: 5 });

    expect(harness.requests.some((r) => r.subCmd === ECONOMY_CMD.currencyGrant)).toBe(true);
    expect(toastTitled(harness, '通货已注入').message).toBe('混沌石 → 5');
    expect(JSON.stringify(harness.root.toast.toasts)).not.toContain('chaos');
  });

  it('通货：目录查不到（未加载）→ 退化为类别名，且整条 Toast 不含 code', async () => {
    const harness = makeHarness({
      subCmd: ECONOMY_CMD.currencyGrant,
      payload: { code: 'chaos', amount: 5 },
    });
    await harness.connect();

    await harness.root.economy.grantCurrency({ code: 'chaos', count: 5 });

    expect(toastTitled(harness, '通货已注入').message).toBe('该通货 → 5');
    expect(JSON.stringify(harness.root.toast.toasts)).not.toContain('chaos');
  });

  it('通货：脏 code（服务端回了目录里没有的码）→ 同样不外泄', async () => {
    const harness = makeHarness({
      subCmd: ECONOMY_CMD.currencyGrant,
      payload: { code: 'zzz_unknown', amount: 1 },
      currencies: [CHAOS],
    });
    await harness.connect();

    await harness.root.economy.grantCurrency({ code: 'zzz_unknown', count: 1 });

    expect(toastTitled(harness, '通货已注入').message).toBe('该通货 → 1');
    expect(JSON.stringify(harness.root.toast.toasts)).not.toContain('zzz_unknown');
  });

  it('精华：目录查得到 → 中文名；查不到 → 类别名', async () => {
    const known = makeHarness({
      subCmd: ECONOMY_CMD.essenceGrant,
      payload: { code: 'ess_atk', count: 9 },
      essences: [ESS_ATK],
    });
    await known.connect();
    await known.root.economy.load();
    await known.root.economy.grantEssence({ code: 'ess_atk', count: 9 });
    expect(toastTitled(known, '精华已注入').message).toBe('锋芒精华 → 9');

    const unknown = makeHarness({
      subCmd: ECONOMY_CMD.essenceGrant,
      payload: { code: 'ess_atk', count: 9 },
    });
    await unknown.connect();
    await unknown.root.economy.grantEssence({ code: 'ess_atk', count: 9 });
    expect(toastTitled(unknown, '精华已注入').message).toBe('该精华 → 9');
    expect(JSON.stringify(unknown.root.toast.toasts)).not.toContain('ess_atk');
  });

  it('边界：注入量为 0 时也照常回中文名（不做「0 就吞掉提示」的隐式分支）', async () => {
    const harness = makeHarness({
      subCmd: ECONOMY_CMD.currencyGrant,
      payload: { code: 'chaos', amount: 0 },
      currencies: [CHAOS],
    });
    await harness.connect();
    await harness.root.economy.load();

    await harness.root.economy.grantCurrency({ code: 'chaos', count: 0 });

    expect(toastTitled(harness, '通货已注入').message).toBe('混沌石 → 0');
  });
});
