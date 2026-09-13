/**
 * SubmitButton：表单提交按钮。
 * 覆盖：默认文案、自定义文案、loading 时不可点击、htmlType 缺省 submit 且可覆盖（原生 type 属性）、
 * disabled / block / danger 与 onClick。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SubmitButton } from './index.js';

describe('SubmitButton', () => {
  it('默认文案为「提交」，且是 primary 按钮', () => {
    render(<SubmitButton />);

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent(/提\s*交/);
    expect(button).toHaveClass('ant-btn-primary');
  });

  it('children 覆盖默认文案', () => {
    render(<SubmitButton>保存</SubmitButton>);

    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeInTheDocument();
  });

  it('loading 时按钮 disabled 且带 loading 态', () => {
    render(<SubmitButton loading />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('ant-btn-loading');
  });

  it('htmlType 缺省为 submit，显式传值可覆盖', () => {
    const { rerender } = render(<SubmitButton />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');

    rerender(<SubmitButton htmlType="reset" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'reset');

    rerender(<SubmitButton htmlType="button" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('disabled 时不触发 onClick', async () => {
    const onClick = vi.fn();
    render(<SubmitButton disabled onClick={onClick} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('点击触发 onClick，block / danger 落到按钮上', async () => {
    const onClick = vi.fn();
    render(
      <SubmitButton block danger onClick={onClick}>
        清空
      </SubmitButton>,
    );

    const button = screen.getByRole('button', { name: /清\s*空/ });
    expect(button).toHaveClass('ant-btn-block');
    expect(button).toHaveClass('ant-btn-dangerous');

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
