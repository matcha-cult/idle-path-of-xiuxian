/**
 * SelectField：选择字段（Form.Item + Select）。
 * 覆盖：Form 内选择并提交、required 空提交校验、disabled、options=[] 不崩、
 * mode=multiple 渲染、无 Form 包裹的边界渲染。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { SubmitButton } from '../../feedback/SubmitButton/index.js';
import type { SelectOption } from './index.js';
import { SelectField } from './index.js';

const OPTIONS: readonly SelectOption[] = [
  { label: '战士', value: 'warrior' },
  { label: '法师', value: 'mage' },
  { label: '刺客', value: 'rogue', disabled: true },
];

describe('SelectField', () => {
  it('在 Form 中选择选项并提交该值', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <SelectField name="role" label="职业" options={OPTIONS} />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByTitle('法师'));
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(onFinish).toHaveBeenCalledWith({ role: 'mage' });
  });

  it('required 未选择时提交显示「请选择」且不提交', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish}>
        <SelectField name="role" label="职业" options={OPTIONS} required />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(await screen.findByText('请选择')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('disabled 时不可展开选择', async () => {
    render(
      <Form>
        <SelectField name="role" label="职业" options={OPTIONS} disabled />
      </Form>,
    );

    expect(screen.getByRole('combobox')).toBeDisabled();

    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByTitle('法师')).not.toBeInTheDocument();
  });

  it('边界：options=[] 仍渲染不崩', async () => {
    render(
      <Form>
        <SelectField name="role" label="职业" options={[]} placeholder="暂无可选项" />
      </Form>,
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(screen.getByTestId('select-field-role')).toBeInTheDocument();

    await userEvent.click(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('mode=multiple 与 allowClear 渲染不崩', async () => {
    const onFinish = vi.fn();
    render(
      <Form onFinish={onFinish} initialValues={{ roles: [] }}>
        <SelectField name="roles" label="职业" options={OPTIONS} mode="multiple" allowClear />
        <SubmitButton htmlType="submit" />
      </Form>,
    );

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByTitle('战士'));
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(onFinish).toHaveBeenCalledWith({ roles: ['warrior'] });
  });

  it('边界：无 Form 包裹也能独立渲染', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<SelectField name="solo" label="独立选择" options={OPTIONS} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
