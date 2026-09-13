/**
 * SectionCard：分区卡片（标题/副标题/extra + 骨架屏加载态）。
 * 覆盖：全插槽渲染、loading 只替换内容区、无标题时不产生头部、空 children、
 * 超长标题、extra 交互与禁用、标题 heading 语义。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { SectionCard } from './index.js';

describe('SectionCard', () => {
  it('正常渲染：title/subtitle/extra/children 全部出现', () => {
    const { container } = render(
      <SectionCard title="储物袋" subtitle="共 12 件" extra={<Button>整理物品</Button>}>
        <p>物品列表</p>
      </SectionCard>,
    );

    expect(screen.getByTestId('section-card-root')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 5, name: '储物袋' })).toBeInTheDocument();
    expect(screen.getByText('共 12 件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '整理物品' })).toBeInTheDocument();
    expect(screen.getByText('物品列表')).toBeInTheDocument();
    expect(container.querySelector('.ant-skeleton')).toBeNull();
  });

  it('loading=true：内容区渲染骨架屏且 children 不渲染', () => {
    const { container } = render(
      <SectionCard title="储物袋" loading>
        <p>物品列表</p>
      </SectionCard>,
    );

    expect(screen.getByTestId('section-card-loading')).toBeInTheDocument();
    expect(container.querySelector('.ant-skeleton')).not.toBeNull();
    expect(screen.queryByText('物品列表')).not.toBeInTheDocument();
    // 加载期间卡片头保留，避免标题闪烁。
    expect(screen.getByRole('heading', { level: 5, name: '储物袋' })).toBeInTheDocument();
  });

  it('边界：title/subtitle 同时缺省时不产生卡片头，children 仍渲染', () => {
    const { container } = render(<SectionCard>裸内容</SectionCard>);

    expect(screen.queryByTestId('section-card-heading')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-card-head')).toBeNull();
    expect(screen.getByText('裸内容')).toBeInTheDocument();
  });

  it('边界：children 为空字符串时卡片存在但内容为空', () => {
    render(<SectionCard title="空分区">{''}</SectionCard>);

    const root = screen.getByTestId('section-card-root');
    expect(root).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 5, name: '空分区' })).toBeInTheDocument();
    expect(root.querySelector('.ant-card-body')?.textContent).toBe('');
  });

  it('边界：超长标题完整渲染，extra 仍可见可用', async () => {
    const onClick = vi.fn();
    const longTitle = '极长分区标题'.repeat(60);
    render(
      <SectionCard title={longTitle} extra={<Button onClick={onClick}>展开详情</Button>}>
        内容
      </SectionCard>,
    );

    expect(screen.getByTestId('section-card-heading')).toHaveTextContent(longTitle);
    await userEvent.click(screen.getByRole('button', { name: '展开详情' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('可访问性：extra 按钮可读，禁用态不触发回调', async () => {
    const onClick = vi.fn();
    render(
      <SectionCard title="设置" extra={<Button disabled onClick={onClick}>保存设置</Button>}>
        内容
      </SectionCard>,
    );

    const button = screen.getByRole('button', { name: '保存设置' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
