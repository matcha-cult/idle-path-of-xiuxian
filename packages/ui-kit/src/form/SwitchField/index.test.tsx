/**
 * SwitchField：开关字段（Form.Item valuePropName="checked" + Switch）。
 * 覆盖：初始值反映到 checked、点击切换后提交 boolean、disabled 不切换、
 * rules 必填空提交校验、checkedChildren/unCheckedChildren、无 Form 包裹的边界渲染。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { SubmitButton } from '../../feedback/SubmitButton/index.js';
import { SwitchField } from './index.js';

describe('SwitchField', () => {
  it('initialValues 反映到开关的 checked，点击切换后提交为 boolean', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish} initialValues={{ active: false }}>
        <SwitchField name="active" label="启用" />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));
    expect(onFinish).toHaveBeenCalledWith({ active: true });
  });

  it('关态提交为 false（valuePropName 生效，值为 boolean 而非 event）', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish} initialValues={{ active: true }}>
        <SwitchField name="active" label="启用" />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(onFinish).toHaveBeenCalledWith({ active: false });
  });

  it('disabled 时点击不切换', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish} initialValues={{ active: false }}>
        <SwitchField name="active" label="启用" disabled />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('rules 透传：必填规则在空提交时显示「请选择」', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <SwitchField name="active" label="启用" rules={[{ required: true, message: '请选择' }]} />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(await screen.findByText('请选择')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('checkedChildren / unCheckedChildren 渲染在开关内', () => {
    render(
      <Form initialValues={{ active: true }}>
        <SwitchField name="active" label="启用" checkedChildren="开" unCheckedChildren="关" />
      </Form>,
    );

    expect(screen.getByRole('switch')).toHaveTextContent('开');
    expect(screen.getByTestId('switch-field-active')).toBeInTheDocument();
  });

  it('边界：无 Form 包裹也能独立渲染', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<SwitchField name="solo" label="独立开关" />);
      expect(screen.getByRole('switch')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
