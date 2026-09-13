/**
 * SettingsPanel 测试：跨 store 聚合面板。交互类用例先 `await harness.connect()`；
 * ConfirmAction（退出登录 / 注入）一律断言「先弹确认、再点确认」两步。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ECONOMY_CMD, ITEM_CMD, PROP_CMD, SKILL_CMD } from '@idle-path/ionet-transport';
import type { Character } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { SettingsPanel } from './SettingsPanel.js';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 42, userId: 1, nickname: '青云子', gender: 'male', title: '散修', spiritStones: 100,
    silver: 0, realm: 3, lingyun: 500, jadeSlips: 2, ...overrides,
  };
}

type Req = { cmd: number; subCmd: number };
const ok = (data: unknown) => ({ data: { success: true, message: 'ok', data } });
const isLingyun = (r: Req) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.lingyunGrant;
const isChaos = (r: Req) => r.cmd === ECONOMY_CMD.cmd && r.subCmd === ECONOMY_CMD.currencyGrant;
const isGenerate = (r: Req) => r.cmd === PROP_CMD.cmd && r.subCmd === PROP_CMD.generate;
const isBases = (r: Req) => r.cmd === ITEM_CMD.cmd && r.subCmd === ITEM_CMD.bases;

/** 设置面板假服务端：dev 注入 + 生成 + 基底库都回成功体。 */
function settingsHandler(request: Req) {
  const { cmd, subCmd } = request;
  if (cmd === PROP_CMD.cmd && subCmd === PROP_CMD.generate) return ok({ item: { id: 1, name: '青锋剑' } });
  if (cmd === ITEM_CMD.cmd && subCmd === ITEM_CMD.inventory) return ok({ items: [], total: 0, page: 1, pageSize: 20 });
  if (cmd === ITEM_CMD.cmd && subCmd === ITEM_CMD.bases) {
    return ok({ bases: [{ code: 'a' }, { code: 'b' }], total: 2, page: 1, pageSize: 100 });
  }
  if (cmd === SKILL_CMD.cmd && subCmd === SKILL_CMD.lingyunGrant) return ok({ lingyun: 2000 });
  if (cmd === ECONOMY_CMD.cmd && subCmd === ECONOMY_CMD.currencyGrant) return ok({ code: 'chaos', amount: 10 });
  if (cmd === ECONOMY_CMD.cmd && subCmd === ECONOMY_CMD.currencies) return ok({ currencies: [] });
  if (cmd === ECONOMY_CMD.cmd && subCmd === ECONOMY_CMD.essences) return ok({ essences: [] });
  return null;
}

describe('SettingsPanel', () => {
  it('渲染账号/运行状态明细，且「一键切换主题」改变 root.theme.mode', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.session.user = { id: 1, username: '道一' };
      harness.root.session.character = makeCharacter();
      harness.root.connection.state = 'online';
      harness.root.connection.latencyMs = 12;
      harness.root.connection.heartbeatAcks = 3;
      harness.root.connection.serverTimeOffsetMs = -50;
    });
    harness.render(<SettingsPanel />);
    const account = screen.getAllByTestId('key-value-list-root')[0]!;
    const runtime = screen.getAllByTestId('key-value-list-root')[1]!;
    expect(within(account).getByText('道一')).toBeInTheDocument();
    expect(within(account).getByText('青云子')).toBeInTheDocument();
    expect(within(account).getByText('42')).toBeInTheDocument();
    expect(within(runtime).getByText('online')).toBeInTheDocument();
    expect(within(runtime).getByText('12 ms')).toBeInTheDocument();
    expect(within(runtime).getByText('3')).toBeInTheDocument();
    expect(within(runtime).getByText('-50 ms')).toBeInTheDocument();
    expect(within(runtime).getByText('亮色')).toBeInTheDocument();
    expect(screen.getByTestId('settings-bases-count')).toHaveTextContent('基底 0 项');
    expect(harness.root.theme.mode).toBe('light');
    await userEvent.click(screen.getByTestId('settings-theme-toggle'));
    expect(harness.root.theme.mode).toBe('dark');
  });

  it('user / character 为 null 时显示占位符而不崩溃', () => {
    const harness = createPanelHarness();
    harness.render(<SettingsPanel />);
    const lists = screen.getAllByTestId('key-value-list-root');
    expect(within(lists[0]!).getAllByText('—').length).toBeGreaterThanOrEqual(4);
    expect(within(lists[0]!).getByText(/灵石 0 · 灵韵 0 · 玉简 0/)).toBeInTheDocument();
  });

  it('开发工具加载中显示骨架，错误显示可重试', () => {
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

  it('「退出登录」先弹确认（仍在线），再点确认才登出', async () => {
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
    await userEvent.click(screen.getByText('确认退出'));
    await waitFor(() => expect(harness.root.session.isAuthenticated).toBe(false));
    expect(harness.root.session.user).toBeNull();
  });

  it('「生成物品」发出 prop.generate（带角色 id）；「拉取基底库」发出 item.bases', async () => {
    const harness = createPanelHarness({ handler: settingsHandler });
    harness.seed(() => {
      harness.root.session.character = makeCharacter({ id: 42 });
    });
    harness.render(<SettingsPanel />);
    await harness.connect();
    await userEvent.click(screen.getByTestId('submit-button'));
    await waitFor(() => expect(harness.requests.filter(isGenerate)).toHaveLength(1));
    expect(harness.requests.filter(isGenerate)[0]?.data).toEqual({ baseId: 1, rarity: 0, characterId: 42 });
    await userEvent.click(screen.getByTestId('settings-load-bases'));
    await waitFor(() => expect(harness.requests.filter(isBases)).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('settings-bases-count')).toHaveTextContent('基底 2 项'));
  });

  it('「注入灵韵」先弹确认（未发请求），再点确认才发出 skill.lingyunGrant', async () => {
    const harness = createPanelHarness({ handler: settingsHandler });
    harness.render(<SettingsPanel />);
    await harness.connect();
    await userEvent.click(screen.getByTestId('settings-grant-lingyun'));
    expect(await screen.findByText('确认注入灵韵')).toBeInTheDocument();
    expect(harness.requests.filter(isLingyun)).toHaveLength(0);
    await userEvent.click(screen.getByText('确认注入灵韵'));
    await waitFor(() => expect(harness.requests.filter(isLingyun)).toHaveLength(1));
    expect(harness.requests.filter(isLingyun)[0]?.data).toEqual({ amount: 1000 });
  });

  it('「注入混沌石 ×10」两步确认后经 WS 发出 economy.currencyGrant', async () => {
    const harness = createPanelHarness({ handler: settingsHandler });
    harness.render(<SettingsPanel />);
    await harness.connect();
    await userEvent.click(screen.getByTestId('settings-grant-chaos'));
    expect(await screen.findByText('确认注入混沌石')).toBeInTheDocument();
    expect(harness.requests.filter(isChaos)).toHaveLength(0);
    await userEvent.click(screen.getByText('确认注入混沌石'));
    await waitFor(() => expect(harness.requests.filter(isChaos)).toHaveLength(1));
    expect(harness.requests.filter(isChaos)[0]?.data).toEqual({ code: 'chaos', count: 10 });
  });
});
