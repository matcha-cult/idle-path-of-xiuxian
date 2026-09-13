/**
 * TextField：文本字段（Form.Item + Input）。
 * 覆盖：Form 内输入提交、required 空提交校验、disabled、label/placeholder/help 关联、
 * 自定义 rules 透传、无 Form 包裹的边界渲染。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { SubmitButton } from '../../feedback/SubmitButton/index.js';
import { TextField } from './index.js';

describe('TextField', () => {
  it('在 Form 中可输入并提交该值', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <TextField name="username" label="用户名" />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    const input = screen.getByTestId('text-field-username');
    await userEvent.type(input, 'xiuxian');
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(onFinish).toHaveBeenCalledWith({ username: 'xiuxian' });
  });

  it('required 为空提交时显示「请输入」且不提交', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <TextField name="username" label="用户名" required />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(await screen.findByText('请输入')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('disabled 时不接受输入', async () => {
    render(
      <Form>
        <TextField name="username" label="用户名" disabled />
      </Form>,
    );

    const input = screen.getByTestId('text-field-username');
    expect(input).toBeDisabled();

    await userEvent.type(input, 'abc');
    expect(input).toHaveValue('');
  });

  it('label / placeholder / help 渲染，且 label 与输入框关联', () => {
    render(
      <Form>
        <TextField name="username" label="用户名" placeholder="请输入用户名" help="登录后不可修改" />
      </Form>,
    );

    const input = screen.getByLabelText('用户名');
    expect(input).toHaveAttribute('placeholder', '请输入用户名');
    expect(screen.getByText('登录后不可修改')).toBeInTheDocument();
  });

  it('自定义 rules 与 required 规则并存（required 追加在末尾）', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <TextField
          name="username"
          label="用户名"
          required
          maxLength={8}
          rules={[{ min: 3, message: '至少 3 个字符' }]}
        />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    const input = screen.getByTestId('text-field-username');
    expect(input).toHaveAttribute('maxlength', '8');

    await userEvent.type(input, 'ab');
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));
    expect(await screen.findByText('至少 3 个字符')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('边界：无 Form 包裹也能独立渲染', () => {
    // Form.Item 脱离 Form 时 rc-field-form 会打 dev 警告，这里静音以免污染输出。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<TextField name="solo" label="独立字段" placeholder="独立" />);
      expect(screen.getByTestId('text-field-solo')).toBeInTheDocument();
      expect(screen.getByLabelText('独立字段')).toHaveAttribute('placeholder', '独立');
    } finally {
      spy.mockRestore();
    }
  });
});
