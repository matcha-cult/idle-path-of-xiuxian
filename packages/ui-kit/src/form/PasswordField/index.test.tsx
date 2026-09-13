/**
 * PasswordField：口令字段（`Input.Password`）。覆盖渲染/边界/校验/禁用。
 */
import { Form } from 'antd';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordField } from './index.js';

describe('PasswordField', () => {
  it('渲染为口令输入（type=password）并能输入', async () => {
    render(
      <Form>
        <PasswordField name="password" label="口令" placeholder="请输入口令" />
      </Form>,
    );

    const input = screen.getByTestId('password-field-password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.type(input, 'secret123');
    expect(input).toHaveValue('secret123');
  });

  it('无外层 Form 也能单独渲染（不崩）', () => {
    expect(() => render(<PasswordField name="password" />)).not.toThrow();
    expect(screen.getByTestId('password-field-password')).toBeInTheDocument();
  });

  it('禁用态生效', () => {
    render(<PasswordField name="password" disabled />);
    expect(screen.getByTestId('password-field-password')).toBeDisabled();
  });

  it('必填校验：空提交时显示默认提示', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <PasswordField name="password" required />
        <button type="submit">提交</button>
      </Form>,
    );

    await userEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('请输入')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('minLength 校验：过短时显示长度提示', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <PasswordField name="password" minLength={6} />
        <button type="submit">提交</button>
      </Form>,
    );

    await userEvent.type(screen.getByTestId('password-field-password'), '123');
    await userEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('至少 6 个字符')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('password-field-password'), '456');
    await userEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('custom rules 与 help/tooltip 透传', () => {
    render(
      <Form>
        <PasswordField
          name="password"
          rules={[{ pattern: /^\w+$/, message: '仅字母数字' }]}
          help="辅助说明"
          tooltip="提示"
        />
      </Form>,
    );
    expect(screen.getByText('辅助说明')).toBeInTheDocument();
  });
});
