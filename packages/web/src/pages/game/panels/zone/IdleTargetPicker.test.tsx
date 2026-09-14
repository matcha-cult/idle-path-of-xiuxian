/**
 * IdleTargetPicker 测试（§23 ① G1/G5）：选项渲染、草稿选中、确认/取消、空态、边界。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createPanelHarness } from '../../../../../test/helpers/panel-harness.js';
import { IdleTargetPicker } from './IdleTargetPicker.js';
import type { IdleTargetOption } from './presentation.js';

const OPTIONS: IdleTargetOption[] = [
  { code: 'zone_r1', name: '青云山', realm: 1, detail: '进度 3 / 3 层 · 已通关 2 轮' },
  { code: 'zone_r4', name: '落霞谷', realm: 4, detail: '进度 3 / 3 层 · 已通关 1 轮' },
];

function setup(props: Partial<Parameters<typeof IdleTargetPicker>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const harness = createPanelHarness();
  harness.render(
    <IdleTargetPicker open options={OPTIONS} value={null} onCancel={onCancel} onConfirm={onConfirm} {...props} />,
  );
  return { onConfirm, onCancel };
}

describe('IdleTargetPicker', () => {
  it('列出全部可挂机秘境，并标出当前挂机点', () => {
    setup({ value: 'zone_r4' });
    const list = screen.getByTestId('idle-target-options');
    expect(list).toHaveTextContent('青云山');
    expect(list).toHaveTextContent('第 1 境');
    expect(list).toHaveTextContent('进度 3 / 3 层 · 已通关 2 轮');
    expect(screen.getByTestId('idle-target-option-zone_r4')).toHaveTextContent('当前');
  });

  it('缺省选中当前值，直接确认即回填同一个 code', async () => {
    const { onConfirm } = setup({ value: 'zone_r4' });
    await userEvent.click(screen.getByRole('button', { name: /设\s*为\s*挂\s*机\s*点/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('zone_r4'));
  });

  it('切到另一项再确认，回传新 code', async () => {
    const { onConfirm } = setup({ value: 'zone_r1' });
    await userEvent.click(screen.getByTestId('idle-target-option-zone_r4'));
    await userEvent.click(screen.getByRole('button', { name: /设\s*为\s*挂\s*机\s*点/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('zone_r4'));
  });

  it('未设置挂机点时缺省选中第一项', async () => {
    const { onConfirm } = setup({ value: null });
    await userEvent.click(screen.getByRole('button', { name: /设\s*为\s*挂\s*机\s*点/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('zone_r1'));
  });

  it('点取消只回调 onCancel，不发确认', async () => {
    const { onConfirm, onCancel } = setup({ value: 'zone_r1' });
    await userEvent.click(screen.getByRole('button', { name: /取\s*消/ }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('边界：没有可选项时给空态引导，且确认按钮禁用', () => {
    setup({ options: [], value: null });
    expect(screen.getByTestId('empty-hint-root')).toBeInTheDocument();
    expect(screen.getByText(/秘境石台/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /设\s*为\s*挂\s*机\s*点/ })).toBeDisabled();
  });

  it('边界：open=false 时不渲染内容（不产生副作用）', () => {
    setup({ open: false });
    expect(screen.queryByTestId('idle-target-options')).toBeNull();
  });
});
