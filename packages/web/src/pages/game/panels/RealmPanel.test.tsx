/**
 * RealmPanel 测试：境界指标 / 灵韵进度 / 三态 / 突破交互 / 封顶边界。
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { REALM_CMD, REALMS } from '@idle-path/ionet-transport';
import type { RealmStatusData } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { RealmPanel } from './RealmPanel.js';

function makeStatus(overrides: Partial<RealmStatusData> = {}): RealmStatusData {
  return { realm: 3, realmName: '柳筋', lingyun: 50, nextCost: 100, isMax: false, ...overrides };
}

describe('RealmPanel', () => {
  it('渲染当前境界 / 灵韵 / 下一境消耗与总境数', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);

    expect(screen.getByText('柳筋')).toBeInTheDocument();
    expect(screen.getByText(`（第 3 境 / 共 ${REALMS.length} 境）`)).toBeInTheDocument();
    expect(screen.getByText('下一境消耗')).toBeInTheDocument();
    expect(screen.getByTestId('resource-bar-root')).toBeInTheDocument();
  });

  it('空态：status 为 null 时显示空态文案', () => {
    const harness = createPanelHarness();
    harness.render(<RealmPanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无境界数据')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.realm.loading = true;
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

  it('点「突破」→ 确认后经 WS 发出 realm.breakthrough', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('realm-breakthrough'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    const requests = harness.requests.filter(
      (r) => r.cmd === REALM_CMD.cmd && r.subCmd === REALM_CMD.breakthrough,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({});
  }, 20000);

  it('点「刷新境界」经 WS 发出 realm.breakthroughInfo', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('realm-refresh'));

    const requests = harness.requests.filter(
      (r) => r.cmd === REALM_CMD.cmd && r.subCmd === REALM_CMD.breakthroughInfo,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({});
  }, 20000);

  it('边界：isMax=true 且 nextCost=null 时显示「已至封顶」、突破按钮禁用、进度条不崩', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.realm.status = makeStatus({
        realm: REALMS.length,
        realmName: '合道',
        isMax: true,
        nextCost: null,
      });
    });
    harness.render(<RealmPanel />);

    expect(screen.getByText('已至封顶')).toBeInTheDocument();
    expect(screen.getByTestId('realm-breakthrough')).toBeDisabled();
    expect(screen.getByTestId('resource-bar-root')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
  });
});
