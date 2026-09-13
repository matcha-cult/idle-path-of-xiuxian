/**
 * ActionForm：schema 驱动的动作表单。
 * 覆盖：四种 kind 全部渲染、提交后 onFinish 收到各类型值（switch 为 boolean）、
 * onCancel 显示取消按钮并回调、无 onCancel 不显示取消、整表 disabled、
 * loading 时提交按钮不可点、fields=[] 的空边界。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionField } from './index.js';
import { ActionForm } from './index.js';

const FIELDS: readonly ActionField[] = [
  { kind: 'text', name: 'username', label: '用户名' },
  { kind: 'number', name: 'age', label: '年龄' },
  {
    kind: 'select',
    name: 'role',
    label: '职业',
    options: [
      { label: '战士', value: 'warrior' },
      { label: '法师', value: 'mage' },
    ],
  },
  { kind: 'switch', name: 'active', label: '启用' },
];

const INITIAL = { username: '', age: 1, role: 'warrior', active: false } as const;

describe('ActionForm', () => {
  it('渲染全部 kind：text / number / select / switch', () => {
    render(<ActionForm fields={FIELDS} initialValues={INITIAL} onFinish={vi.fn()} />);

    expect(screen.getByTestId('action-form-root')).toBeInTheDocument();
    expect(screen.getByTestId('text-field-username')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('提交后 onFinish 收到各字段值（switch 为 boolean）', async () => {
    const onFinish = vi.fn();
    render(<ActionForm fields={FIELDS} initialValues={INITIAL} onFinish={onFinish} />);

    await userEvent.type(screen.getByTestId('text-field-username'), 'han');
    const spin = screen.getByRole('spinbutton');
    await userEvent.clear(spin);
    await userEvent.type(spin, '18');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByTitle('法师'));
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(onFinish).toHaveBeenCalledWith({ username: 'han', age: 18, role: 'mage', active: true });
    // 交互步骤多（打字 / 清空 / 下拉 / 开关），并发跑全量用例时放宽超时避免误判。
  }, 20000);

  it('传 onCancel 时渲染取消按钮并回调，且不触发 onFinish', async () => {
    const onFinish = vi.fn();
    const onCancel = vi.fn();
    render(<ActionForm fields={FIELDS} initialValues={INITIAL} onFinish={onFinish} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /取\s*消/ }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('未传 onCancel 时不渲染取消按钮', () => {
    render(<ActionForm fields={FIELDS} initialValues={INITIAL} onFinish={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /取\s*消/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /提\s*交/ })).toBeInTheDocument();
  });

  it('disabled 整表禁用（字段与提交按钮都不可用）', () => {
    render(<ActionForm fields={FIELDS} initialValues={INITIAL} onFinish={vi.fn()} disabled onCancel={vi.fn()} />);

    expect(screen.getByTestId('text-field-username')).toBeDisabled();
    expect(screen.getByRole('button', { name: /提\s*交/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /取\s*消/ })).toBeDisabled();
  });

  it('loading 时提交按钮 loading，取消按钮禁用', () => {
    render(<ActionForm fields={FIELDS} initialValues={INITIAL} onFinish={vi.fn()} onCancel={vi.fn()} loading />);

    expect(screen.getByRole('button', { name: /提\s*交/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /取\s*消/ })).toBeDisabled();
  });

  it('插槽：submitText / cancelText / layout 覆盖默认值', () => {
    render(
      <ActionForm
        fields={FIELDS}
        initialValues={INITIAL}
        onFinish={vi.fn()}
        onCancel={vi.fn()}
        submitText="保存"
        cancelText="返回"
        layout="inline"
      />,
    );

    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返\s*回/ })).toBeInTheDocument();
  });

  it('边界：fields=[] 只渲染动作区，提交得到空对象', async () => {
    const onFinish = vi.fn();
    render(<ActionForm fields={[]} onFinish={onFinish} />);

    expect(screen.queryByTestId('text-field-username')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-form-actions')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));
    expect(onFinish).toHaveBeenCalledWith({});
  });
});
