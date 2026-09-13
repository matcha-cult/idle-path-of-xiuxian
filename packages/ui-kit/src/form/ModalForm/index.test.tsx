/**
 * ModalForm：Modal + ActionForm。
 * 覆盖：open=false 不渲染表单、open=true 渲染标题与表单、提交调用 onFinish、
 * 取消调用 onCancel、confirmText/cancelText 覆盖、loading 时确认按钮不可点。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionField } from '../ActionForm/index.js';
import { ModalForm } from './index.js';

const FIELDS: readonly ActionField[] = [{ kind: 'text', name: 'name', label: '名称' }];

describe('ModalForm', () => {
  it('open=false 时不渲染表单', () => {
    render(<ModalForm open={false} title="新建角色" fields={FIELDS} onCancel={vi.fn()} onFinish={vi.fn()} />);

    expect(screen.queryByTestId('action-form-root')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('open=true 时渲染标题与表单', () => {
    render(<ModalForm open title="新建角色" fields={FIELDS} onCancel={vi.fn()} onFinish={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('新建角色')).toBeInTheDocument();
    expect(screen.getByTestId('action-form-root')).toBeInTheDocument();
    expect(screen.getByTestId('modal-form-root')).toBeInTheDocument();
    expect(screen.getByTestId('text-field-name')).toBeInTheDocument();
  });

  it('填表并提交后调用 onFinish', async () => {
    const onFinish = vi.fn();
    render(<ModalForm open title="新建角色" fields={FIELDS} onCancel={vi.fn()} onFinish={onFinish} />);

    await userEvent.type(screen.getByTestId('text-field-name'), 'han');
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(onFinish).toHaveBeenCalledWith({ name: 'han' });
  });

  it('点取消按钮调用 onCancel，且不触发 onFinish', async () => {
    const onCancel = vi.fn();
    const onFinish = vi.fn();
    render(<ModalForm open title="新建角色" fields={FIELDS} onCancel={onCancel} onFinish={onFinish} />);

    await userEvent.click(screen.getByRole('button', { name: /取\s*消/ }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('插槽：confirmText / cancelText 覆盖默认文案', () => {
    render(
      <ModalForm
        open
        title="新建角色"
        fields={FIELDS}
        onCancel={vi.fn()}
        onFinish={vi.fn()}
        confirmText="创建"
        cancelText="再想想"
        width={480}
      />,
    );

    expect(screen.getByRole('button', { name: /创\s*建/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再想想' })).toBeInTheDocument();
  });

  it('loading 时确认按钮不可点', () => {
    render(<ModalForm open title="新建角色" fields={FIELDS} onCancel={vi.fn()} onFinish={vi.fn()} loading />);

    expect(screen.getByRole('button', { name: /提\s*交/ })).toBeDisabled();
  });
});
