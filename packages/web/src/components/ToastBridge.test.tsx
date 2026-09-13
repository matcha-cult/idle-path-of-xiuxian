/**
 * ToastBridge：ToastStore 队列 → antd message；消费后队列清空（不双重展示）。
 */
import { runInAction } from 'mobx';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createPanelHarness } from '../../test/helpers/panel-harness.js';
import { ToastBridge } from './ToastBridge.js';

describe('ToastBridge', () => {
  it('错误 Toast 交给 antd message 展示，并清空 Store 队列', async () => {
    const harness = createPanelHarness();
    harness.render(<ToastBridge />);

    runInAction(() => {
      harness.root.toast.error('背包加载失败', '[CHARACTER_NOT_FOUND]');
    });

    await waitFor(() => {
      expect(screen.getByText(/背包加载失败/)).toBeInTheDocument();
    });
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('成功与提示级 Toast 分别展示', async () => {
    const harness = createPanelHarness();
    harness.render(<ToastBridge />);

    runInAction(() => {
      harness.root.toast.success('装备成功');
      harness.root.toast.info('暂无可结算收益', '离线 0 小时');
    });

    await waitFor(() => {
      expect(screen.getByText(/装备成功/)).toBeInTheDocument();
    });
    expect(await screen.findByText(/暂无可结算收益/)).toBeInTheDocument();
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('无 Toast 时不渲染任何内容，且不报错', () => {
    const harness = createPanelHarness();
    expect(() => harness.render(<ToastBridge />)).not.toThrow();
    expect(harness.root.toast.toasts).toHaveLength(0);
  });
});
