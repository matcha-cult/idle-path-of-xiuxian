/**
 * QuantityInput：受控渲染、输入回调、禁用态、value=0、min>max 不抛错。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QuantityInput } from './index.js';

/** 受控宿主：验证真实输入链路（组件自身无状态）。 */
function Harness({ initial, disabled }: { initial?: number; disabled?: boolean }) {
  const [value, setValue] = useState<number | undefined>(initial);
  return <QuantityInput value={value} onChange={(next) => setValue(next ?? undefined)} disabled={disabled} />;
}

describe('QuantityInput · 渲染', () => {
  it('受控 value 渲染到输入框', () => {
    render(<QuantityInput value={7} onChange={vi.fn()} />);

    expect(screen.getByTestId('quantity-input')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveValue('7');
  });

  it('value=0 可渲染（不是「未填」）', () => {
    render(<QuantityInput value={0} onChange={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toHaveValue('0');
  });

  it('value=undefined 可渲染（空值 + 占位文案）', () => {
    render(<QuantityInput value={undefined} onChange={vi.fn()} placeholder="数量" />);
    expect(screen.getByRole('spinbutton')).toHaveValue('');
    expect(screen.getByPlaceholderText('数量')).toBeInTheDocument();
  });

  it('addonAfter 透传渲染', () => {
    // antd v6 对 addonAfter 发出弃用提示（建议 Space.Compact），这里只验证透传结果。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<QuantityInput value={1} onChange={vi.fn()} addonAfter={<span>个</span>} />);
      expect(screen.getByText('个')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('QuantityInput · 交互与边界', () => {
  it('输入触发 onChange（受控回写生效）', async () => {
    const user = userEvent.setup();
    render(<Harness initial={1} />);

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '12');
    expect(input).toHaveValue('12');
  });

  it('清空输入回传 null 而不是 NaN', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QuantityInput value={5} onChange={onChange} />);

    await user.clear(screen.getByRole('spinbutton'));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('disabled 生效', () => {
    render(<QuantityInput value={3} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });

  it('min>max 原样透传且不抛错', () => {
    render(<QuantityInput value={5} onChange={vi.fn()} min={10} max={1} />);

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('aria-valuemin', '10');
    expect(input).toHaveAttribute('aria-valuemax', '1');
  });
});
