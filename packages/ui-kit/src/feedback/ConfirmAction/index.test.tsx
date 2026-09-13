/**
 * ConfirmAction：危险操作二次确认（antd Popconfirm）。
 * 覆盖：触发弹泡 → 确认回调、取消不回调、disabled 不弹、异步 onConfirm 不抛错、
 * 文案覆盖与自定义触发元素。
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmAction } from './index.js';

function Trigger() {
  return <Button>删除</Button>;
}

describe('ConfirmAction', () => {
  it('点击触发元素弹出气泡，点确认调用 onConfirm', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmAction title="确认删除该记录？" onConfirm={onConfirm}>
        <Trigger />
      </ConfirmAction>,
    );

    expect(screen.queryByRole('button', { name: /确\s*定/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    const ok = await screen.findByRole('button', { name: /确\s*定/ });
    expect(await screen.findByText('确认删除该记录？')).toBeInTheDocument();

    await userEvent.click(ok);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('点取消只关闭气泡，不触发 onConfirm', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmAction title="确认删除？" onConfirm={onConfirm}>
        <Trigger />
      </ConfirmAction>,
    );

    await userEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    await userEvent.click(await screen.findByRole('button', { name: /取\s*消/ }));

    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: /确\s*定/ })).not.toBeInTheDocument());
  });

  it('disabled 时点击触发元素不弹气泡', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmAction title="确认删除？" onConfirm={onConfirm} disabled>
        <Trigger />
      </ConfirmAction>,
    );

    await userEvent.click(screen.getByRole('button', { name: /删\s*除/ }));

    expect(screen.queryByRole('button', { name: /确\s*定/ })).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('onConfirm 返回 Promise：只调用一次，resolve 后不抛错', async () => {
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(
      <ConfirmAction title="确认删除？" onConfirm={onConfirm}>
        <Trigger />
      </ConfirmAction>,
    );

    await userEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfirm?.();
    });
  });

  it('插槽：okText / cancelText / description 覆盖默认文案', async () => {
    render(
      <ConfirmAction
        title="删除该配置？"
        description="删除后不可恢复"
        okText="删掉"
        cancelText="算了"
        danger
        onConfirm={vi.fn()}
      >
        <Trigger />
      </ConfirmAction>,
    );

    await userEvent.click(screen.getByRole('button', { name: /删\s*除/ }));

    expect(await screen.findByRole('button', { name: /删\s*掉/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /算\s*了/ })).toBeInTheDocument();
    expect(screen.getByText('删除后不可恢复')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-action-root')).toBeInTheDocument();
  });
});
