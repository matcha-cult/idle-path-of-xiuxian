/**
 * ThemeProvider：主题算法/locale 接线 + antd App 上下文可用性。
 *
 * 断言方式：在 Provider 内部放探针组件，用 `theme.useToken()` 读回真实 token，
 * 用 `App.useApp()` 读回上下文实例 —— 而不是断言实现细节的 class 名。
 */
import { App as AntApp, theme } from 'antd';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIMARY_COLOR, type ThemeMode } from '../types.js';
import { ThemeProvider } from './index.js';

interface ProbeSnapshot {
  colorPrimary: string;
  colorBgContainer: string;
  hasMessage: boolean;
  hasModal: boolean;
}

const snapshots: ProbeSnapshot[] = [];

function Probe() {
  const { token } = theme.useToken();
  const app = AntApp.useApp();
  snapshots.push({
    colorPrimary: token.colorPrimary,
    colorBgContainer: token.colorBgContainer,
    hasMessage: typeof app.message?.success === 'function',
    hasModal: typeof app.modal?.confirm === 'function',
  });
  return <span data-testid="probe">probe</span>;
}

function renderProbe(mode: ThemeMode, primaryColor?: string) {
  snapshots.length = 0;
  return render(
    <ThemeProvider mode={mode} {...(primaryColor === undefined ? {} : { primaryColor })}>
      <Probe />
    </ThemeProvider>,
  );
}

describe('ThemeProvider', () => {
  it('渲染子节点并提供 antd App 上下文（message/modal 非静态可用）', () => {
    renderProbe('light');
    expect(screen.getByTestId('probe')).toBeInTheDocument();
    const snapshot = snapshots.at(-1);
    expect(snapshot?.hasMessage).toBe(true);
    expect(snapshot?.hasModal).toBe(true);
  });

  it('缺省主题色来自 DEFAULT_PRIMARY_COLOR', () => {
    renderProbe('light');
    expect(snapshots.at(-1)?.colorPrimary).toBe(DEFAULT_PRIMARY_COLOR);
  });

  it('显式主题色透传到 token', () => {
    renderProbe('light', '#ff00ff');
    expect(snapshots.at(-1)?.colorPrimary).toBe('#ff00ff');
  });

  it('dark 与 light 的实际 token 不同（证明算法真的生效，而非只传了配置）', () => {
    renderProbe('light');
    const light = snapshots.at(-1)?.colorBgContainer;
    renderProbe('dark');
    const dark = snapshots.at(-1)?.colorBgContainer;
    expect(light).toBeDefined();
    expect(dark).toBeDefined();
    expect(light).not.toBe(dark);
  });

  it('两种模式都能正常渲染（无异常）', () => {
    expect(() => renderProbe('light')).not.toThrow();
    expect(() => renderProbe('dark')).not.toThrow();
  });
});
