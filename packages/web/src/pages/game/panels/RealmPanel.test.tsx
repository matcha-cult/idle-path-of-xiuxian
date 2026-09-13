/**
 * RealmPanel（新版·玩法驱动）测试。
 * 重点：14 境进度与灵韵差额是否呈现、破境能解锁什么、协议字段是否真的没上屏。
 * 常量一律从 transport 导入（不写字面量），交互用例必须先 `await harness.connect()`。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { REALM_CMD, REALMS, type RealmStatusData, type ZoneView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { RealmPanel } from './RealmPanel.js';

function makeStatus(overrides: Partial<RealmStatusData> = {}): RealmStatusData {
  return { realm: 3, realmName: REALMS[2] ?? '柳筋', lingyun: 50, nextCost: 100, isMax: false, ...overrides };
}

function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
    id: 1,
    code: 'zone_1',
    name: '青云山脚',
    chapter: 1,
    orderIndex: 1,
    minRealm: 4,
    requirePrevBestFloor: 0,
    unlocked: true,
    unlockedReason: 'ok',
    prevZone: null,
    prevBestFloor: 0,
    current: true,
    unitCode: 'wolf_1',
    bossCode: null,
    basePower: 20,
    powerStep: 4,
    maxFloor: 10,
    lingyunBonusPerFloor: 2,
    progress: { bestFloor: 4, branch: 1, cleared: false, unlocked: true },
    ...overrides,
  } as ZoneView;
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.zone.zones = [makeZone()];
    seedFn?.(harness.root);
  });
  return harness;
}

describe('RealmPanel · 14 境进度与灵韵差额（玩法信息）', () => {
  it('展示 当前境界/第几境共几境/剩余灵韵/下一境消耗/可穿 T 阶', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);

    const stats = screen.getByTestId('realm-progress-stats');
    expect(stats).toHaveTextContent('当前境界');
    expect(stats).toHaveTextContent(REALMS[2] ?? '');
    expect(stats).toHaveTextContent(new RegExp(`第 3 / ${REALMS.length} 境`));
    expect(stats).toHaveTextContent('剩余灵韵');
    expect(stats).toHaveTextContent('50');
    expect(stats).toHaveTextContent('下一境消耗');
    expect(stats).toHaveTextContent('100');
    expect(stats).toHaveTextContent('T4');
    expect(screen.getByTestId('realm-lingyun-bar')).toHaveTextContent('50 / 100');
  });

  it('回归：境界进度的说明文字必须落在 title（小字），不能进 value 行', () => {
    // 曾经的写法把「（第 3 境 / 共 14 境）」塞进 StatItem 的 suffix，而 antd v6 的 suffix
    // 与 value 共用 contentFontSize → PC 折 2 行、手机折 7 行（一字一行）。
    // 这里按 antd 的 DOM 结构把「主数值行」和「标题行」分开断言，防止再次退化。
    const harness = setup((root) => {
      root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);

    const cell = screen.getByTestId('realm-progress-stats').querySelector('.ant-statistic');
    expect(cell?.querySelector('.ant-statistic-title')?.textContent).toBe(
      `当前境界 · 第 3 / ${REALMS.length} 境`,
    );
    // value 行只有境界名：既没有括号，也没有「共 N 境」这类说明
    const valueLine = cell?.querySelector('.ant-statistic-content')?.textContent ?? '';
    expect(valueLine).toBe(REALMS[2]);
    expect(valueLine).not.toContain('境 /');
    expect(valueLine).not.toContain('第');
  });

  it('灵韵不足时给出「差多少」而不是只报错', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ lingyun: 50, nextCost: 120 });
    });
    harness.render(<RealmPanel />);

    const compare = screen.getByTestId('realm-cost-compare');
    expect(compare).toHaveTextContent('灵韵不足');
    expect(compare).toHaveTextContent('差 70');
  });

  it('灵韵达标时显示可以破境', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ lingyun: 150, nextCost: 120 });
    });
    harness.render(<RealmPanel />);

    expect(screen.getByTestId('realm-cost-compare')).toHaveTextContent('可以破境');
  });

  it('「破境后解锁」展示下一境名、可穿 T 阶与可进秘境（join 秘境名单）', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ realm: 3 });
      root.zone.zones = [
        makeZone({ name: '青云山脚', minRealm: 4 }),
        makeZone({ id: 2, code: 'zone_9', name: '寒潭', minRealm: 9, unlocked: false }),
      ];
    });
    harness.render(<RealmPanel />);

    const unlock = screen.getByTestId('realm-unlock');
    expect(unlock).toHaveTextContent('下一境');
    expect(unlock).toHaveTextContent(REALMS[3] ?? '');
    expect(unlock).toHaveTextContent('T4');
    expect(unlock).toHaveTextContent('青云山脚');
    expect(unlock).not.toHaveTextContent('寒潭');
  });
});

describe('RealmPanel · 三态与破境动作', () => {
  it('空态：status 为 null 时显示空态文案且不崩', () => {
    const harness = setup();
    harness.render(<RealmPanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无境界数据')).toBeInTheDocument();
    expect(screen.queryByTestId('realm-unlock')).toBeNull();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = setup((root) => {
      root.realm.loading = true;
    });
    const view = harness.render(<RealmPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.realm.loading = false;
      harness.root.realm.error = '境界信息加载失败';
    });
    harness.render(<RealmPanel />);
    expect(screen.getByText('境界信息加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('灵韵不足时突破按钮禁用，悬浮说明还差多少', async () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ lingyun: 50, nextCost: 120 });
    });
    harness.render(<RealmPanel />);

    const button = screen.getByTestId('realm-breakthrough');
    expect(button).toBeDisabled();
    await userEvent.hover(button);
    expect(await screen.findByText(/还差 70/)).toBeInTheDocument();
  });

  it('灵韵充足时经确认后发出 realm.breakthrough', async () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ lingyun: 200, nextCost: 120 });
    });
    harness.render(<RealmPanel />);
    await harness.connect();

    expect(screen.getByTestId('realm-breakthrough')).toBeEnabled();
    await userEvent.click(screen.getByTestId('realm-breakthrough'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === REALM_CMD.cmd && r.subCmd === REALM_CMD.breakthrough).length,
      ).toBeGreaterThan(0),
    );
  });

  it('点「刷新境界」经 WS 发出 realm.breakthroughInfo', async () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('realm-refresh'));
    await waitFor(() =>
      expect(
        harness.requests.some((r) => r.cmd === REALM_CMD.cmd && r.subCmd === REALM_CMD.breakthroughInfo),
      ).toBe(true),
    );
  });
});

describe('RealmPanel · 边界与协议字段', () => {
  it('边界：isMax=true 且 nextCost=null 时「已至封顶」、按钮禁用、进度条不崩', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({
        realm: REALMS.length,
        realmName: REALMS[REALMS.length - 1] ?? '合道',
        isMax: true,
        nextCost: null,
      });
    });
    harness.render(<RealmPanel />);

    expect(screen.getByTestId('realm-breakthrough')).toBeDisabled();
    expect(screen.getByTestId('realm-progress-stats')).toHaveTextContent('已至封顶');
    expect(screen.getByTestId('realm-lingyun-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('realm-cost-compare')).toBeNull();
    expect(screen.getByTestId('realm-unlock')).toHaveTextContent(`T${REALMS.length}`);
    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
  });

  it('协议字段不上屏，且不出现成功率/尝试/失败字样（必定成功）', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);

    const text = document.body.textContent ?? '';
    for (const leaked of ['nextCost', 'isMax', 'realmName', 'breakthroughInfo', 'zone_1', 'wolf_1']) {
      expect(text).not.toContain(leaked);
    }
    for (const forbidden of ['成功率', '尝试', '失败']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
