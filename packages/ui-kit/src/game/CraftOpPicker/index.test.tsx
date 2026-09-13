/**
 * CraftOpPicker：网格/列表布局、消耗展示、禁用原因 Tooltip、空态与悬空 value 边界。
 * 覆盖：正常渲染 / 空数组 / 全禁用 / value 不在 ops 内 / 交互回调 / 可访问性。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CraftOpPicker, type CraftOpOption } from './index.js';

const OPS: readonly CraftOpOption[] = [
  { op: 'chaos', label: '混沌石改造', costLabel: '混沌石 ×1', available: true },
  { op: 'exalt', label: '崇高石增幅', costLabel: '崇高石 ×1', available: false, disabledReason: '崇高石不足' },
  { op: 'alt', label: '改造石洗练', available: true },
];

/** 取某项可点击的 `<label>` 外壳（antd 把 `data-testid` 落在内层 input 上）。 */
function labelOf(op: string): HTMLElement {
  const wrapper = screen.getByTestId(`craft-op-picker-item-${op}`).closest('label');
  if (!wrapper) throw new Error(`未找到 ${op} 的 label 外壳`);
  return wrapper;
}

describe('CraftOpPicker · 正常渲染', () => {
  it('逐项显示名称与消耗；未给 costLabel 的项不留空占位', () => {
    render(<CraftOpPicker ops={OPS} onChange={vi.fn()} />);

    expect(screen.getByTestId('craft-op-picker-root')).toBeInTheDocument();
    expect(screen.getByTestId('craft-op-picker-label-chaos')).toHaveTextContent('混沌石改造');
    expect(screen.getByTestId('craft-op-picker-cost-chaos')).toHaveTextContent('混沌石 ×1');
    expect(screen.queryByTestId('craft-op-picker-cost-alt')).toBeNull();
    expect(screen.getByTestId('craft-op-picker-label-alt')).toHaveTextContent('改造石洗练');
  });

  it('受控选中：value 命中时该项呈选中态', () => {
    render(<CraftOpPicker ops={OPS} value="chaos" onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /混沌石改造/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /改造石洗练/ })).not.toBeChecked();
  });

  it('layout 切换为 list 时用纵向排布（Radio.Group orientation=vertical）', () => {
    const { rerender } = render(<CraftOpPicker ops={OPS} onChange={vi.fn()} />);
    expect(screen.getByTestId('craft-op-picker-group').className).not.toContain('vertical');

    rerender(<CraftOpPicker ops={OPS} onChange={vi.fn()} layout="list" />);
    expect(screen.getByTestId('craft-op-picker-group').className).toContain('vertical');
  });
});

describe('CraftOpPicker · 可用性与禁用原因', () => {
  it('available=false 的项被禁用，且外面包了承接 hover 的 span', () => {
    render(<CraftOpPicker ops={OPS} onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /崇高石增幅/ })).toBeDisabled();
    expect(screen.getByTestId('craft-op-picker-tip-exalt')).toBeInTheDocument();
    expect(screen.queryByTestId('craft-op-picker-tip-chaos')).toBeNull();
  });

  it('悬停禁用项时 Tooltip 显示 disabledReason', async () => {
    render(<CraftOpPicker ops={OPS} onChange={vi.fn()} />);

    await userEvent.hover(screen.getByTestId('craft-op-picker-tip-exalt'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('崇高石不足');
  });

  it('边界：全部不可用时仍渲染全部选项，不降级为空态', () => {
    const unavailable = OPS.map((option) => ({ ...option, available: false }));
    render(<CraftOpPicker ops={unavailable} onChange={vi.fn()} />);

    expect(screen.queryByTestId('craft-op-picker-empty')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(unavailable.length);
  });

  it('边界：value 不在 ops 内时一项都不选中且不崩', () => {
    render(<CraftOpPicker ops={OPS} value="not-exist" onChange={vi.fn()} />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });
});

describe('CraftOpPicker · 空态与交互', () => {
  it('边界：ops=[] 渲染 emptyText，缺省文案兜底', () => {
    const { unmount } = render(<CraftOpPicker ops={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('craft-op-picker-empty')).toHaveTextContent('暂无可执行的操作');
    expect(screen.queryByTestId('craft-op-picker-group')).toBeNull();
    unmount();

    render(<CraftOpPicker ops={[]} onChange={vi.fn()} emptyText="当前物品无可用炼器操作" />);
    expect(screen.getByTestId('craft-op-picker-empty')).toHaveTextContent('当前物品无可用炼器操作');
  });

  it('交互：点击可用项回调 op，点禁用项不回调', async () => {
    const onChange = vi.fn();
    render(<CraftOpPicker ops={OPS} onChange={onChange} />);

    // 注：antd v6 的 `Radio.Button` 把真正的 `<input>` 设为 `pointer-events: none`，
    // 点击目标必须落在包住它的 `<label>`（`userEvent` 会拒绝点击 input）。
    await userEvent.click(labelOf('alt'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('alt');

    await userEvent.click(labelOf('exalt'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('可访问性：选项组可用 role=radio 定位，名称包含操作名与消耗', () => {
    render(<CraftOpPicker ops={OPS} onChange={vi.fn()} />);

    expect(screen.getAllByRole('radio')).toHaveLength(OPS.length);
    expect(screen.getByRole('radio', { name: /混沌石改造/ })).toHaveAccessibleName(/混沌石 ×1/);
  });
});
