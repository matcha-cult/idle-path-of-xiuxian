/**
 * 面板容器兜底：任一游戏域的面板渲染期抛错 → 该域显示可读错误卡（而不是整树卸载 = 白屏），
 * 切到别的域后错误态不粘住（ErrorBoundary 的 `key` 跟着域走）。
 *
 * 手法：把 `MapPanel` mock 成必抛组件（其余 11 域用真面板）。
 */
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { RootStoreProvider } from '../../app/root-context.js';
import { ThemeRoot } from '../../theme/theme-root.js';
import { createPanelHarness, type PanelHarness } from '../../../test/helpers/panel-harness.js';
import { GameShellPage } from './GameShellPage.js';
import { renderGameDomainContent } from './panel-registry.js';

vi.mock('./panels/MapPanel.js', () => ({
  MapPanel: function Boom(): never {
    throw new Error('地图面板炸了');
  },
}));

/** 登录 + 建角，直接进游戏外壳。 */
function makeHarness(): PanelHarness {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.session.token = 'jwt-1';
    harness.root.session.user = { id: 7, username: 'alice' };
    harness.root.session.status = 'authenticated';
    harness.root.session.character = {
      id: 3, userId: 7, nickname: '验收道友', gender: 'male', title: '散修',
      spiritStones: 0, silver: 0, realm: 3, lingyun: 0, jadeSlips: 0,
    } as never;
    harness.root.session.hasCharacter = true;
  });
  return harness;
}

function renderShell(harness: PanelHarness): void {
  const Wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <RootStoreProvider value={harness.root}>
      <ThemeRoot>{children}</ThemeRoot>
    </RootStoreProvider>
  );
  rtlRender(<GameShellPage />, { wrapper: Wrapper });
}

let consoleError: MockInstance<Parameters<Console['error']>, void>;
beforeEach(() => {
  // 边界的 onError 与 React 自己都会往 console.error 打一遍；这里只静音输出，不影响断言
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe('panel-registry · 渲染期异常兜底（B1：白屏 → 可读错误卡）', () => {
  it('未知域返回 null', () => {
    expect(renderGameDomainContent('not-a-domain')).toBeNull();
  });

  it('正常域照常渲染面板（没有额外 DOM 包裹）', () => {
    const harness = makeHarness();
    renderShell(harness);
    expect(screen.getByTestId('realm-refresh')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-alert')).toBeNull();
  });

  it('面板抛错 → 显示错误卡 + `onError` 打 console.error，而不是白屏', async () => {
    const harness = makeHarness();
    renderShell(harness);

    await userEvent.click(screen.getByRole('menuitem', { name: /地图/ }));

    await waitFor(() => expect(screen.getByTestId('error-boundary-alert')).toBeInTheDocument());
    expect(screen.getByTestId('error-boundary-title')).toHaveTextContent('「地图」渲染出错');
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent('地图面板炸了');
    // 外壳还在（不是整树白屏）
    expect(screen.getByTestId('shell-content')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('[panel:map] 渲染出错', expect.any(Error), expect.anything());
  });

  it('切到别的域后错误态不粘住（boundary 随 key 重挂）', async () => {
    const harness = makeHarness();
    renderShell(harness);

    await userEvent.click(screen.getByRole('menuitem', { name: /地图/ }));
    await waitFor(() => expect(screen.getByTestId('error-boundary-alert')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('menuitem', { name: /设置/ }));
    await waitFor(() => expect(screen.queryByTestId('error-boundary-alert')).toBeNull());
    expect(screen.getByTestId('shell-content')).toBeInTheDocument();
  });
});
