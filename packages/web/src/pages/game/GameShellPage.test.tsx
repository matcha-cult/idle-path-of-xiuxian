/**
 * GameShellPage：分组导航 / 默认与切换内容 / HUD 数据 / 全量刷新 / 折叠。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ITEM_CMD, type Character } from '@idle-path/ionet-transport';
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
    expect(within(content).getByText('境界')).toBeInTheDocument();
  });

  it('点击侧栏条目切换内容区（秘境 → 秘境占位）', async () => {
    const harness = makeHarness();
    harness.render(<GameShellPage />);

    // 图标会进入可访问名（antd 图标带 aria-label），故用正则匹配
    await userEvent.click(screen.getByRole('menuitem', { name: /秘境/ }));

    const content = screen.getByTestId('shell-content');
    expect(within(content).getByText('秘境')).toBeInTheDocument();
    expect(within(content).queryByText('境界')).toBeNull();
  });

  it('全部 11 个域当前均为占位状态（旧版面板判定不合格，待按玩法重做）', () => {
    const harness = makeHarness();
    harness.render(<GameShellPage />);
    expect(listGameDomains().every((d) => d.status === 'pending')).toBe(true);
    expect(screen.getByTestId('panel-placeholder-status')).toHaveTextContent('重做中');
  });
});

describe('GameShellPage · HUD 与操作', () => {
  it('HUD 展示玩法驱动条目（境界/灵韵/玉简/秘境/战力/待结算）', () => {
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

    expect(screen.getByTestId('hud-item-realm')).toHaveTextContent('柳筋'); // REALMS[2]（realm=3）
    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('456');
    expect(screen.getByTestId('hud-item-jadeSlips')).toHaveTextContent('2');
    expect(screen.getByTestId('hud-item-zone')).toHaveTextContent('未进入');
    expect(screen.getByTestId('hud-item-pending')).toHaveTextContent('7 小时');
    // 灵石当前无消费出口，刻意不进 HUD（见 GameHud 注释与 10 号文档 §0）
    expect(screen.queryByTestId('hud-item-spiritStones')).toBeNull();
  });

  it('角色为空时 HUD 不崩（显示占位）', () => {
    const harness = createPanelHarness();
    harness.render(<GameShellPage />);
    expect(screen.getByTestId('hud-item-realm')).toHaveTextContent('—');
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
