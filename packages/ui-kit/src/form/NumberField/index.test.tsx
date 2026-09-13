/**
 * NumberField：数字字段（Form.Item + InputNumber）。
 * 覆盖：Form 内输入提交为 number、required 空提交校验、disabled、
 * addonAfter/placeholder、min>max 与非有限数不抛错、无 Form 包裹的边界渲染。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { SubmitButton } from '../../feedback/SubmitButton/index.js';
import { NumberField } from './index.js';

describe('NumberField', () => {
  it('在 Form 中输入数字并提交为 number 值', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <NumberField name="age" label="年龄" min={0} max={999} step={1} />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    await userEvent.type(screen.getByRole('spinbutton'), '42');
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(onFinish).toHaveBeenCalledWith({ age: 42 });
  });

  it('required 为空提交时显示「请输入」且不提交', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <NumberField name="age" label="年龄" required />
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
        <NumberField name="age" label="年龄" disabled />
      </Form>,
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toBeDisabled();

    await userEvent.type(input, '7');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('placeholder / addonAfter / precision 渲染', () => {
    render(
      <Form>
        <NumberField name="age" label="年龄" placeholder="请输入年龄" precision={2} addonAfter="岁" />
      </Form>,
    );

    expect(screen.getByRole('spinbutton')).toHaveAttribute('placeholder', '请输入年龄');
    expect(screen.getByText('岁')).toBeInTheDocument();
  });

  it('边界：min > max、NaN、Infinity 都不抛错且能渲染', () => {
    const { rerender } = render(
      <Form>
        <NumberField name="bad" label="越界" min={10} max={1} />
      </Form>,
    );
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();

    rerender(
      <Form>
        <NumberField name="bad" label="非有限" min={Number.NaN} max={Number.POSITIVE_INFINITY} step={Number.NaN} />
      </Form>,
    );
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('边界：无 Form 包裹也能独立渲染', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<NumberField name="solo" label="独立数字" />);
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
