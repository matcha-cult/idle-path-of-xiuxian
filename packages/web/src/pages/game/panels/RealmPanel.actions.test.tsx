/**
 * RealmPanel 测试（续）：**三态与破境动作 + 边界与协议字段**。
 *
 * 从 `RealmPanel.test.tsx` 拆出（单文件规模）；进度 / 灵韵差额 / 破境后解锁在主文件。
 * 交互用例必须先 `await harness.connect()`。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { REALM_CMD, REALMS, type RealmStatusData, type ZoneBreakthroughView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { RealmPanel } from './RealmPanel.js';

function makeStatus(overrides: Partial<RealmStatusData> = {}): RealmStatusData {
  return { realm: 3, realmName: REALMS[2] ?? '柳筋', lingyun: 50, nextCost: 100, isMax: false, ...overrides };
}

function makeBreakthrough(overrides: Partial<ZoneBreakthroughView> = {}): ZoneBreakthroughView {
  return {
    code: 'zone_1',
    name: '青云山脚',
    realm: 1,
    tierKind: 'training',
    canBreakthrough: true,
    lockReason: 'ok',
    unlockItemCode: null,
    cleared: true,
    clears: 2,
    bestFloor: 4,
    maxFloor: 10,
    basePower: 20,
    powerStep: 4,
    ...overrides,
  };
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.zone.breakthrough = [makeBreakthrough()];
    seedFn?.(harness.root);
  });
  return harness;
}

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
    for (const leaked of ['nextCost', 'isMax', 'realmName', 'breakthroughInfo', 'zone_1', 'training']) {
      expect(text).not.toContain(leaked);
    }
    for (const forbidden of ['成功率', '尝试', '失败']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
