/**
 * SettingsPanel 测试（新版 §1.11）：账号与角色 / 界面 / 运行状态 / 开发者工具。
 * 覆盖：正常渲染 / 未登录空态 / loading+error / 交互真发出 cmd+subCmd / 边界（null、极值）/
 * 协议字段不上屏（token、userId、characterId 与诊断字段均不出现）。
 * 交互用例必须先 `await harness.connect()`；常量一律从 `@idle-path/ionet-transport` 导入。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  ECONOMY_CMD,
  PROP_CMD,
  SKILL_CMD,
  type Character,
} from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { SettingsPanel } from './SettingsPanel.js';
import { realmText } from './settings/presentation.js';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 42,
    userId: 1,
    nickname: '青云子',
    gender: 'male',
    title: '散修',
    spiritStones: 100,
    silver: 0,
    realm: 3,
    lingyun: 500,
    jadeSlips: 2,
    ...overrides,
  };
}

type Req = { cmd: number; subCmd: number };
const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });
const isLingyun = (r: Req) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.lingyunGrant;
const isChaos = (r: Req) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.currencyGrant;
const isGenerate = (r: Req) => r.cmd === PROP_CMD.cmd && r.subCmd === PROP_CMD.generate;

/** 假服务端：三个 dev 动作都回成功体。 */
function settingsHandler(request: Req) {
  if (isGenerate(request)) return ok({ item: { id: 1, name: '青锋剑' } });
  if (isLingyun(request)) return ok({ lingyun: 2000 });
  if (isChaos(request)) return ok({ code: 'chaos', amount: 1000 });
  if (request.cmd === 30 && request.subCmd === 1) return ok({ items: [], total: 0, page: 1, pageSize: 20 });
  return null;
}

describe('SettingsPanel', () => {
  it('渲染账号与角色：用户名 / 道号 / 境界中文 / 资源，且不展示内部编号', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.user = { id: 1, username: '道一' };
      harness.root.session.character = makeCharacter();
    });
    harness.render(<SettingsPanel />);

    const account = screen.getByTestId('settings-account');
    expect(within(account).getByText('道一')).toBeInTheDocument();
    expect(within(account).getByText('青云子')).toBeInTheDocument();
    expect(within(account).getByText(/第 3 境/)).toBeInTheDocument();
    expect(within(account).getByText(/灵石 100 · 灵韵 500 · 玉简 2/)).toBeInTheDocument();

    const html = document.body.textContent ?? '';
    for (const forbidden of ['userId', 'characterId', 'token', 'reqId', '心跳', '时钟偏移', 'handshake']) {
      expect(html).not.toContain(forbidden);
    }
    // 内部编号不得上屏：道号 / 用户名之外的数字不应出现。
    expect(within(account).queryByText('42')).not.toBeInTheDocument();
    expect(within(account).queryByText('1')).not.toBeInTheDocument();
  });

  it('界面区：主题一键切换（ThemeToggle）从亮色切到暗色并回写 store', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.user = { id: 1, username: '道一' };
      harness.root.session.character = makeCharacter();
    });
    harness.render(<SettingsPanel />);

    expect(harness.root.theme.mode).toBe('light');
    expect(screen.getByTestId('settings-theme-mode')).toHaveTextContent(/亮色/);
    await userEvent.click(screen.getByTestId('theme-toggle'));
    expect(harness.root.theme.mode).toBe('dark');
    expect(screen.getByTestId('settings-theme-mode')).toHaveTextContent(/暗色/);
  });

  it('运行状态：未登录时账号区显示空态，连接状态与延迟按中文展示', async () => {
    const harness = createPanelHarness();
    harness.render(<SettingsPanel />);

    expect(screen.getByText('尚未登录')).toBeInTheDocument();
    const runtime = screen.getByTestId('settings-runtime');
    expect(within(runtime).getByText('未连接')).toBeInTheDocument();
    expect(within(runtime).getByText('—')).toBeInTheDocument();
    expect(within(runtime).getByText('紧凑（始终开启）')).toBeInTheDocument();

    harness.seed(() => {
      harness.root.connection.state = 'online';
      harness.root.connection.latencyMs = 12.4;
    });
    await waitFor(() => {
      expect(within(screen.getByTestId('settings-runtime')).getByText('在线')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('settings-runtime')).getByText('12 毫秒')).toBeInTheDocument();
  });

  it('开发者工具：loading 显示骨架、error 显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.prop.loading = true;
    });
    const view = harness.render(<SettingsPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.prop.loading = false;
      harness.root.prop.error = '生成失败';
    });
    harness.render(<SettingsPanel />);
    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('「生成物品」发出 prop.generate（稀有度下拉可选），character 为 null 时回退 null', async () => {
    const harness = createPanelHarness({ handler: settingsHandler });
    harness.render(<SettingsPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('submit-button'));
    await waitFor(() => expect(harness.requests.filter(isGenerate)).toHaveLength(1));
    expect(harness.requests.filter(isGenerate)[0]?.data).toEqual({ baseId: 1, rarity: 0, characterId: null });
  });

  it('「注入灵韵」两步确认后才发出 skill.lingyunGrant（数量受控，默认 1000）', async () => {
    const harness = createPanelHarness({ handler: settingsHandler });
    harness.seed(() => {
      harness.root.session.character = makeCharacter();
    });
    harness.render(<SettingsPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('settings-grant-lingyun'));
    expect(await screen.findByText('确认注入灵韵 ×1000？')).toBeInTheDocument();
    expect(harness.requests.filter(isLingyun)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /确认注入灵韵/ }));
    await waitFor(() => expect(harness.requests.filter(isLingyun)).toHaveLength(1));
    expect(harness.requests.filter(isLingyun)[0]?.data).toEqual({ amount: 1000 });
  });

  it('边界：注入数量清空回退最小值，改值后 chaos 注入携带新数量', async () => {
    const harness = createPanelHarness({ handler: settingsHandler });
    harness.render(<SettingsPanel />);
    await harness.connect();

    const input = screen.getByTestId('quantity-input');
    await userEvent.clear(input);
    // QuantityInput 清空回传 null → 组件回退到 DEV_GRANT_MIN。
    await userEvent.click(screen.getByTestId('settings-grant-chaos'));
    expect(await screen.findByText('确认注入混沌石 ×1？')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /确认注入混沌石/ }));
    await waitFor(() => expect(harness.requests.filter(isChaos)).toHaveLength(1));
    expect(harness.requests.filter(isChaos)[0]?.data).toEqual({ code: 'chaos', count: 1 });
  });

  it('「退出登录」两步确认：先弹确认仍在线，再点确认才登出', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.token = 'jwt-token';
      harness.root.session.user = { id: 1, username: '道一' };
    });
    harness.render(<SettingsPanel />);
    expect(harness.root.session.isAuthenticated).toBe(true);

    await userEvent.click(screen.getByTestId('settings-logout'));
    expect(await screen.findByText('确认退出登录？')).toBeInTheDocument();
    expect(harness.root.session.isAuthenticated).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /确认退出/ }));
    await waitFor(() => expect(harness.root.session.isAuthenticated).toBe(false));
    expect(harness.root.session.user).toBeNull();
  });

  it('边界：realm 非法值给占位符，不抛错也不回显字段名', () => {
    expect(realmText(null)).toBe('—');
    expect(realmText(undefined)).toBe('—');
    expect(realmText(Number.NaN)).toBe('—');
    expect(realmText(99)).toBe('第 99 境');
  });
});
