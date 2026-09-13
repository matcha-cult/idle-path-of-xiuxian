/**
 * GameShellPage：分组导航 / 默认与切换内容 / HUD 数据 / 全量刷新 / 折叠。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ITEM_CMD, type Character } from '@idle-path/ionet-transport';
import { setViewportWidth } from '@idle-path/ui-kit/testing';
import { createPanelHarness } from '../../../test/helpers/panel-harness.js';
import { SIDE_NAV_GROUPS, listGameDomainKeys, listGameDomains } from './panel-registry.js';
import { GameShellPage } from './GameShellPage.js';

const character: Character = {
  id: 3,
  userId: 7,
  nickname: '验收道友',
  gender: 'male',
  title: '散修',
  spiritStones: 12345,
  silver: 0,
  realm: 3,
  lingyun: 456,
  jadeSlips: 2,
};

function makeHarness() {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.session.token = 'jwt-1';
    harness.root.session.user = { id: 7, username: 'alice' };
    harness.root.session.status = 'authenticated';
    harness.root.session.character = character;
    harness.root.session.hasCharacter = true;
  });
  return harness;
}

describe('GameShellPage · 导航（分组按玩法因果链：修行/器物/征伐/道途/系统）', () => {
  it('侧栏按 5 个分组渲染全部 11 个游戏域', () => {
    const harness = makeHarness();
    const { container } = harness.render(<GameShellPage />);

    const groupTitles = [...container.querySelectorAll('.ant-menu-item-group-title')].map(
      (node) => node.textContent,
    );
    expect(groupTitles).toEqual(SIDE_NAV_GROUPS.map((g) => g.label));

    const itemLabels = [...container.querySelectorAll('.ant-menu-item')].map((node) => node.textContent);
    expect(itemLabels).toEqual(listGameDomains().map((d) => d.label));
    expect(listGameDomainKeys()).toHaveLength(11);
  });

  it('默认选中第一个域（修行·境界），内容区显示其占位', () => {
    const harness = makeHarness();
    harness.render(<GameShellPage />);

    const content = screen.getByTestId('shell-content');
    expect(within(content).getByTestId('panel-placeholder-root')).toBeInTheDocument();
    // 内容区标题来自 Card head，侧栏也有同名条目，故按容器限定
    expect(content.querySelector('.ant-card-head-title')?.textContent).toBe('境界');
  });

  it('点击侧栏条目切换内容区（秘境 → 秘境占位）', async () => {
    const harness = makeHarness();
    harness.render(<GameShellPage />);

    // 图标会进入可访问名（antd 图标带 aria-label），故用正则匹配
    await userEvent.click(screen.getByRole('menuitem', { name: /秘境/ }));

    const content = screen.getByTestId('shell-content');
    expect(content.querySelector('.ant-card-head-title')?.textContent).toBe('秘境');
    expect(within(content).getByTestId('panel-placeholder-highlights')).toBeInTheDocument();
  });

  it('全部 11 个域当前均为占位状态（旧版面板判定不合格，待按玩法重做）', () => {
    const harness = makeHarness();
    harness.render(<GameShellPage />);
    expect(listGameDomains().every((d) => d.status === 'pending')).toBe(true);
    expect(screen.getByTestId('panel-placeholder-status')).toHaveTextContent('重做中');
  });
});

describe('GameShellPage · HUD 与操作', () => {
  it('页头承载身份（昵称/头衔/境界），HUD 只放 5 个玩法驱动条目', () => {
    const harness = makeHarness();
    harness.seed(() => {
      harness.root.idle.status = {
        realm: 3,
        lastSettleAt: '2026-09-13T00:00:00.000Z',
        pendingHours: 7,
        effectiveHours: 6.3,
        estimatedKills: 70,
        estimatedLingyun: 140,
        dailyItemsProduced: 1,
        dailyItemCap: 200,
        config: { roundsPerHour: 60, efficiencyPct: 90, maxOfflineHours: 12 },
      };
    });
    harness.render(<GameShellPage />);

    // 身份在页头（REALMS[2] = 柳筋，realm=3）
    expect(screen.getByTestId('shell-identity')).toHaveTextContent('验收道友');
    expect(screen.getByTestId('shell-realm')).toHaveTextContent('柳筋');

    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('456');
    expect(screen.getByTestId('hud-item-jadeSlips')).toHaveTextContent('2');
    expect(screen.getByTestId('hud-item-zone')).toHaveTextContent('未进入');
    expect(screen.getByTestId('hud-item-pending')).toHaveTextContent('7 小时');
    // 境界移到页头、灵石刻意不入 HUD（10 号文档 §0/§2）
    expect(screen.queryByTestId('hud-item-realm')).toBeNull();
    expect(screen.queryByTestId('hud-item-spiritStones')).toBeNull();
  });

  it('角色为空时页头与 HUD 不崩（显示占位）', () => {
    const harness = createPanelHarness();
    harness.render(<GameShellPage />);
    expect(screen.getByTestId('shell-identity')).toHaveTextContent('—');
    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('0');
  });

  it('点击「全量刷新」真的发起面板加载请求', async () => {
    const harness = makeHarness();
    harness.render(<GameShellPage />);
    await harness.connect();

    const before = harness.requests.length;
    await userEvent.click(screen.getByTestId('shell-refresh-all'));

    await waitFor(() => expect(harness.requests.length).toBeGreaterThan(before));
    expect(
      harness.requests.some((r) => r.cmd === ITEM_CMD.cmd && r.subCmd === ITEM_CMD.inventory),
    ).toBe(true);
  });

  it('点击折叠触发条后侧栏进入折叠态', async () => {
    const harness = makeHarness();
    const { container } = harness.render(<GameShellPage />);

    expect(container.querySelector('.ant-layout-sider-collapsed')).toBeNull();
    await userEvent.click(container.querySelector('.ant-layout-sider-trigger') as Element);

    await waitFor(() => expect(container.querySelector('.ant-layout-sider-collapsed')).not.toBeNull());
  });

  it('HUD 内含主题切换（游戏外壳不再依赖悬浮按钮）', async () => {
    const harness = makeHarness();
    harness.render(<GameShellPage />);

    await userEvent.click(screen.getByTestId('theme-toggle'));
    expect(harness.root.theme.mode).toBe('dark');
  });
});

describe('GameShellPage · 移动端（视口 393，PC/移动双端兼容）', () => {
  it('不渲染侧栏，导航收进抽屉；页头出现菜单按钮', () => {
    setViewportWidth(393);
    const harness = makeHarness();
    harness.render(<GameShellPage />);

    expect(screen.queryByTestId('app-shell-sider')).toBeNull();
    expect(screen.getByTestId('app-shell-menu-button')).toBeInTheDocument();
    // 抽屉初始关闭 → 导航条目不在文档中
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('打开抽屉后可见全部分组导航，点击条目切换内容并关闭抽屉', async () => {
    setViewportWidth(393);
    const harness = makeHarness();
    harness.render(<GameShellPage />);

    const menuButton = screen.getByTestId('app-shell-menu-button');
    await userEvent.click(menuButton);
    expect(await screen.findByRole('menuitem', { name: /秘境/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('menuitem', { name: /秘境/ }));
    await waitFor(() => expect(menuButton).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.getByTestId('shell-content').querySelector('.ant-card-head-title')?.textContent).toBe('秘境');
  });

  it('HUD 取值不被压成竖排（仍能读到完整文本）', () => {
    setViewportWidth(393);
    const harness = makeHarness();
    harness.seed(() => {
      harness.root.idle.status = {
        realm: 3,
        lastSettleAt: '2026-09-13T00:00:00.000Z',
        pendingHours: 2.0210366666666667,
        effectiveHours: 1.8,
        estimatedKills: 20,
        estimatedLingyun: 40,
        dailyItemsProduced: 0,
        dailyItemCap: 200,
        config: { roundsPerHour: 60, efficiencyPct: 90, maxOfflineHours: 12 },
      };
    });
    harness.render(<GameShellPage />);

    // 竖排的根因是等宽表格单元格；改为紧凑聚类后文本完整且不被拆字
    expect(screen.getByTestId('hud-item-pending')).toHaveTextContent('2 小时 1 分');
    expect(screen.getByTestId('hud-item-zone')).toHaveTextContent('未进入');
    expect(screen.getByTestId('shell-identity')).toHaveTextContent('验收道友');
    expect(screen.getByTestId('shell-content')).toBeInTheDocument();
  });

  it('宽屏恢复侧栏形态（跨断点切换）', () => {
    setViewportWidth(393);
    const harness = makeHarness();
    const view = harness.render(<GameShellPage />);
    expect(screen.queryByTestId('app-shell-sider')).toBeNull();

    view.unmount();
    setViewportWidth(1280);
    harness.render(<GameShellPage />);
    expect(screen.getByTestId('app-shell-sider')).toBeInTheDocument();
  });
});
