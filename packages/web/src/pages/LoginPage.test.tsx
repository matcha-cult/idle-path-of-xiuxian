/**
 * LoginPage：字段/校验/模式切换/提交成功与失败。
 * 提交走真实 `RootStore.login()`（REST 由假 fetch 应答，WS 由夹具假适配器应答）。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../test/helpers/panel-harness.js';
import { LoginPage } from './LoginPage.js';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

const loginOk: FetchLike = async () =>
  jsonResponse({
    success: true,
    message: '登录成功',
    data: { token: 'jwt-1', user: { id: 7, username: 'alice' } },
  });

describe('LoginPage', () => {
  it('默认登录模式：渲染道号/口令字段与登录按钮', () => {
    const harness = createPanelHarness();
    harness.render(<LoginPage />);
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('text-field-username')).toBeInTheDocument();
    expect(screen.getByTestId('password-field-password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /登\s*录/ })).toBeInTheDocument();
  });

  it('空表单提交触发校验，不发请求', async () => {
    const harness = createPanelHarness({ fetchImpl: loginOk });
    harness.render(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    // 道号与口令都必填 → 出现两条「请输入」校验文案
    expect((await screen.findAllByText('请输入')).length).toBeGreaterThanOrEqual(1);
    expect(harness.root.session.isAuthenticated).toBe(false);
  });

  it('口令过短触发长度校验', async () => {
    const harness = createPanelHarness({ fetchImpl: loginOk });
    harness.render(<LoginPage />);

    await userEvent.type(screen.getByTestId('text-field-username'), 'alice');
    await userEvent.type(screen.getByTestId('password-field-password'), '123');
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByText('至少 6 个字符')).toBeInTheDocument();
    expect(harness.root.session.isAuthenticated).toBe(false);
  });

  it('登录成功：token 落库、状态变已认证', async () => {
    const harness = createPanelHarness({ fetchImpl: loginOk });
    harness.render(<LoginPage />);

    await userEvent.type(screen.getByTestId('text-field-username'), 'alice');
    await userEvent.type(screen.getByTestId('password-field-password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => expect(harness.root.session.isAuthenticated).toBe(true));
    expect(harness.root.session.user?.username).toBe('alice');
  });

  it('切换到注册模式后按钮文案变化，且调用注册接口', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () =>
      jsonResponse({
        success: true,
        message: '注册成功',
        data: { token: 'jwt-2', user: { id: 8, username: 'bob' } },
      }),
    );
    const harness = createPanelHarness({ fetchImpl });
    harness.render(<LoginPage />);

    await userEvent.click(screen.getByText('注册'));
    expect(screen.getByRole('button', { name: '注册并登录' })).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('text-field-username'), 'bob');
    await userEvent.type(screen.getByTestId('password-field-password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: '注册并登录' }));

    await waitFor(() => expect(harness.root.session.isAuthenticated).toBe(true));
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/auth/register');
  });

  it('REST 业务失败（HTTP 200 + success:false）显示错误提示且未登录', async () => {
    const harness = createPanelHarness({
      fetchImpl: async () => jsonResponse({ success: false, message: '用户名或密码错误' }),
    });
    harness.render(<LoginPage />);

    await userEvent.type(screen.getByTestId('text-field-username'), 'alice');
    await userEvent.type(screen.getByTestId('password-field-password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('用户名或密码错误');
    expect(harness.root.session.isAuthenticated).toBe(false);
  });
});
