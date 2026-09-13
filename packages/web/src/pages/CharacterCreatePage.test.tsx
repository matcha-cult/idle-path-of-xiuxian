/**
 * CharacterCreatePage：字段/默认值/提交/失败提示/退出登录。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../test/helpers/panel-harness.js';
import { CharacterCreatePage } from './CharacterCreatePage.js';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

const createdCharacter = {
  id: 3,
  userId: 7,
  nickname: '验收道友',
  gender: 'male',
  title: '散修',
  spiritStones: 10000,
  silver: 0,
  realm: 1,
  lingyun: 0,
  jadeSlips: 0,
};

function makeHarness(fetchImpl: FetchLike) {
  const harness = createPanelHarness({ fetchImpl });
  harness.seed(() => {
    harness.root.session.token = 'jwt-1';
    harness.root.session.user = { id: 7, username: 'alice' };
    harness.root.session.status = 'authenticated';
  });
  return harness;
}

describe('CharacterCreatePage', () => {
  it('渲染账号信息、昵称与性别字段（性别默认男）', () => {
    const harness = makeHarness(async () => jsonResponse({ success: true, message: 'ok', data: {} }));
    harness.render(<CharacterCreatePage />);

    expect(screen.getByTestId('character-create-account')).toHaveTextContent('道号：alice');
    expect(screen.getByTestId('text-field-nickname')).toBeInTheDocument();
    expect(screen.getByText('男')).toBeInTheDocument();
  });

  it('昵称留空提交触发校验，不调接口', async () => {
    const harness = makeHarness(async () => jsonResponse({ success: true, message: 'ok', data: {} }));
    harness.render(<CharacterCreatePage />);

    await userEvent.click(screen.getByRole('button', { name: '创建角色' }));
    expect(await screen.findByText('请输入')).toBeInTheDocument();
    expect(harness.root.session.hasCharacter).toBe(false);
  });

  it('提交成功：hasCharacter=true 且角色写入 store', async () => {
    const harness = makeHarness(async () =>
      jsonResponse({
        success: true,
        message: '角色创建成功',
        data: { hasCharacter: true, character: createdCharacter },
      }),
    );
    harness.render(<CharacterCreatePage />);

    await userEvent.type(screen.getByTestId('text-field-nickname'), '验收道友');
    await userEvent.click(screen.getByRole('button', { name: '创建角色' }));

    await waitFor(() => expect(harness.root.session.hasCharacter).toBe(true));
    expect(harness.root.session.character?.nickname).toBe('验收道友');
  });

  it('失败分支：昵称为空由服务端拒绝时展示错误提示', async () => {
    const harness = makeHarness(async () =>
      jsonResponse({ success: false, message: '角色数量已达上限（1）' }),
    );
    harness.render(<CharacterCreatePage />);

    await userEvent.type(screen.getByTestId('text-field-nickname'), '验收道友');
    await userEvent.click(screen.getByRole('button', { name: '创建角色' }));

    expect(await screen.findByTestId('character-create-error')).toHaveTextContent('角色数量已达上限');
    expect(harness.root.session.hasCharacter).toBe(false);
  });

  it('点击退出登录清空会话', async () => {
    const harness = makeHarness(async () => jsonResponse({ success: true, message: 'ok', data: {} }));
    harness.render(<CharacterCreatePage />);

    await userEvent.click(screen.getByTestId('character-create-logout'));
    expect(harness.root.session.isAuthenticated).toBe(false);
  });
});
