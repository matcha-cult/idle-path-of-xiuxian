/**
 * PageShell：页头 + 工具条 + 内容三段布局壳。
 * 覆盖：全插槽渲染、缺省插槽不占位、空 children、超长标题、工具条按钮交互、
 * 标题的 heading 可访问语义。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { PageShell } from './index.js';

describe('PageShell', () => {
  it('正常渲染：title/subtitle/extra/toolbar/children 全部出现', () => {
    render(
      <PageShell
        title="洞府"
        subtitle="修炼与储物"
        extra={<Button>页面设置</Button>}
        toolbar={<Button>刷新数据</Button>}
      >
        <p>面板内容</p>
      </PageShell>,
    );

    expect(screen.getByTestId('page-shell-root')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: '洞府' })).toBeInTheDocument();
    expect(screen.getByText('修炼与储物')).toBeInTheDocument();
    expect(screen.getByTestId('page-shell-extra')).toContainElement(screen.getByRole('button', { name: '页面设置' }));
    expect(screen.getByTestId('toolbar-root')).toContainElement(screen.getByRole('button', { name: '刷新数据' }));
    expect(screen.getByText('面板内容')).toBeInTheDocument();
  });

  it('边界：缺省 subtitle/extra/toolbar 时不渲染对应区域', () => {
    render(<PageShell title="只有标题">正文</PageShell>);

    expect(screen.getByRole('heading', { level: 4, name: '只有标题' })).toBeInTheDocument();
    expect(screen.queryByTestId('page-shell-extra')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toolbar-root')).not.toBeInTheDocument();
    expect(screen.getByText('正文')).toBeInTheDocument();
  });

  it('边界：children 为空字符串时内容区无节点，外壳仍完整', () => {
    const { container } = render(
      <PageShell title="空内容" subtitle="" extra={null} toolbar={undefined}>
        {''}
      </PageShell>,
    );

    const root = screen.getByTestId('page-shell-root');
    expect(root).toBeInTheDocument();
    // 除页头文本外没有任何内容节点。
    expect(root.textContent).toBe('空内容');
    expect(container.querySelector('[data-testid="page-shell-extra"]')).toBeNull();
    expect(container.querySelector('[data-testid="toolbar-root"]')).toBeNull();
  });

  it('边界：超长标题完整渲染，不被截断', () => {
    const longTitle = '极长的页面标题'.repeat(50);
    render(<PageShell title={longTitle}>正文</PageShell>);

    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(longTitle);
  });

  it('交互：工具条与页头右侧按钮均可点击并回调', async () => {
    const onRefresh = vi.fn();
    const onSettings = vi.fn();
    render(
      <PageShell
        title="洞府"
        extra={<Button onClick={onSettings}>页面设置</Button>}
        toolbar={<Button onClick={onRefresh}>刷新数据</Button>}
      >
        正文
      </PageShell>,
    );

    await userEvent.click(screen.getByRole('button', { name: '刷新数据' }));
    await userEvent.click(screen.getByRole('button', { name: '页面设置' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('可访问性：标题为 level 4 heading，且标题节点与附加操作同属页头', () => {
    render(
      <PageShell title="宝库" extra={<Button disabled>不可用</Button>}>
        正文
      </PageShell>,
    );

    const header = screen.getByTestId('page-shell-header');
    expect(header).toContainElement(screen.getByRole('heading', { level: 4, name: '宝库' }));
    expect(screen.getByRole('button', { name: '不可用' })).toBeDisabled();
  });
});
