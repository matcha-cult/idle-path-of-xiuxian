/**
 * PanelTabs：config 驱动的面板容器。
 * 覆盖：items 正常渲染、空 items、点击切换回调、受控/非受控、disabled 页签、
 * **内容随 items 变化而变化**（配置驱动、无 if/switch）、页签可访问语义。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PanelTabItem } from '../../pluggable/panel-registry/index.js';
import { PanelTabs } from './index.js';

/** 测试用面板集合：可插拔内容全部来自配置。 */
const ITEMS: PanelTabItem[] = [
  { key: 'cultivation', label: '修炼', order: 0, children: <p>修炼面板</p> },
  { key: 'bag', label: '储物袋', order: 1, children: <p>储物袋面板</p> },
  { key: 'settings', label: '设置', order: 2, disabled: true, children: <p>设置面板</p> },
];

describe('PanelTabs', () => {
  it('正常渲染：每个 item 生成一个页签，默认激活第一项并显示其 children', () => {
    render(<PanelTabs items={ITEMS} />);

    expect(screen.getByTestId('panel-tabs-root')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: '修炼' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('修炼面板')).toBeInTheDocument();
  });

  it('边界：items=[] 时渲染空容器，不抛错也不产生页签', () => {
    render(<PanelTabs items={[]} />);

    expect(screen.getByTestId('panel-tabs-root')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('修炼面板')).not.toBeInTheDocument();
  });

  it('边界：children 缺省的页签内容区为空，但页签仍可激活', async () => {
    const onChange = vi.fn();
    render(
      <PanelTabs
        items={[
          { key: 'filled', label: '有内容', children: <p>正文</p> },
          { key: 'empty', label: '空面板' },
        ]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: '空面板' }));
    expect(onChange).toHaveBeenCalledWith('empty');
    expect(screen.getByRole('tab', { name: '空面板' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('panel-tabs-root')).toBeInTheDocument();
  });

  it('交互：点击页签触发 onChange 并切换内容（非受控 + defaultActiveKey）', async () => {
    const onChange = vi.fn();
    render(<PanelTabs items={ITEMS} defaultActiveKey="cultivation" onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: '储物袋' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('bag');
    expect(screen.getByRole('tab', { name: '储物袋' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('储物袋面板')).toBeInTheDocument();
  });

  it('受控：activeKey 不变时内容不切换，但 onChange 照常回调', async () => {
    const onChange = vi.fn();
    render(<PanelTabs items={ITEMS} activeKey="cultivation" onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: '储物袋' }));

    expect(onChange).toHaveBeenCalledWith('bag');
    expect(screen.getByRole('tab', { name: '修炼' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('修炼面板')).toBeInTheDocument();
  });

  it('disabled 页签：不可点击、不触发 onChange', async () => {
    const onChange = vi.fn();
    render(<PanelTabs items={ITEMS} onChange={onChange} />);

    const disabled = screen.getByRole('tab', { name: '设置' });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: '修炼' })).toHaveAttribute('aria-selected', 'true');
  });

  it('配置驱动：更换 items 数组即更换页签与内容（组件内无 if/switch）', () => {
    const first: PanelTabItem[] = [{ key: 'alpha', label: '甲', children: <p>阿尔法面板</p> }];
    const second: PanelTabItem[] = [
      { key: 'beta', label: '乙', children: <p>贝塔面板</p> },
      { key: 'gamma', label: '丙', children: <p>伽马面板</p> },
    ];

    const { rerender } = render(<PanelTabs items={first} />);
    expect(screen.getByText('阿尔法面板')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(1);

    rerender(<PanelTabs items={second} />);
    expect(screen.queryByText('阿尔法面板')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '甲' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByText('贝塔面板')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '乙' })).toHaveAttribute('aria-selected', 'true');
  });

  it('可访问性：页签具备 tab 语义，icon 与居中/destroyOnHidden 透传不破坏结构', () => {
    render(
      <PanelTabs
        items={[{ key: 'a', label: '甲', icon: <span aria-hidden="true">★</span>, children: <p>甲面板</p> }]}
        centered
        destroyOnHidden
      />,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveAccessibleName('甲');
    expect(screen.getByRole('tab', { name: '甲' })).toHaveAttribute('aria-selected', 'true');
  });
});
