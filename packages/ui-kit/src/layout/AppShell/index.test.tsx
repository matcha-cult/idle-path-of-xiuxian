/**
 * AppShell：四段插槽、页头按需渲染、折叠控制与宽度。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './index.js';

describe('AppShell', () => {
  it('渲染 nav / header / headerExtra / hud / children 五处插槽', () => {
    render(
      <AppShell
        nav={<span>导航区</span>}
        header={<span>页头左</span>}
        headerExtra={<button type="button">页头右</button>}
        hud={<span>信息条</span>}
      >
        <span>内容区</span>
      </AppShell>,
    );

    expect(screen.getByTestId('app-shell-root')).toBeInTheDocument();
    expect(screen.getByText('导航区')).toBeInTheDocument();
    expect(screen.getByText('页头左')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '页头右' })).toBeInTheDocument();
    expect(screen.getByText('信息条')).toBeInTheDocument();
    expect(screen.getByText('内容区')).toBeInTheDocument();
  });

  it('未传 header/headerExtra 时不渲染页头行，但 hud 仍渲染', () => {
    render(
      <AppShell nav={<span>nav</span>} hud={<span data-testid="only-hud">仅信息条</span>}>
        <span>content</span>
      </AppShell>,
    );
    expect(screen.getByTestId('only-hud')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-header')).toBeInTheDocument();
  });

  it('collapsible=false 时不出现折叠触发条', () => {
    const { container } = render(
      <AppShell nav={<span>nav</span>} collapsible={false}>
        <span>content</span>
      </AppShell>,
    );
    expect(container.querySelector('.ant-layout-sider-trigger')).toBeNull();
  });

  it('点击折叠触发条回调 onCollapse(true)', async () => {
    const onCollapse = vi.fn();
    const { container } = render(
      <AppShell nav={<span>nav</span>} onCollapse={onCollapse}>
        <span>content</span>
      </AppShell>,
    );

    const trigger = container.querySelector('.ant-layout-sider-trigger');
    expect(trigger).not.toBeNull();
    await userEvent.click(trigger as Element);
    // antd 的 onCollapse 会带第二个参数（触发来源），因此只断言首参
    await waitFor(() => expect(onCollapse).toHaveBeenCalled());
    expect(onCollapse.mock.calls[0]?.[0]).toBe(true);
  });

  it('受控 collapsed=true 时侧栏进入折叠态', () => {
    const { container } = render(
      <AppShell nav={<span>nav</span>} collapsed>
        <span>content</span>
      </AppShell>,
    );
    expect(container.querySelector('.ant-layout-sider-collapsed')).not.toBeNull();
  });

  it('自定义 siderWidth 生效', () => {
    const { container } = render(
      <AppShell nav={<span>nav</span>} siderWidth={320}>
        <span>content</span>
      </AppShell>,
    );
    const sider = container.querySelector('.ant-layout-sider') as HTMLElement;
    expect(sider.style.width).toBe('320px');
  });
});
