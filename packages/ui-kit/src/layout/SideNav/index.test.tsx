/**
 * SideNav：分组渲染、选中态、点击回调、禁用项、空配置、标题/底部插槽。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SideNav, type SideNavGroup } from './index.js';

const groups: SideNavGroup[] = [
  {
    key: 'grow',
    label: '养成',
    items: [
      { key: 'bag', label: '背包' },
      { key: 'equip', label: '装备' },
    ],
  },
  {
    key: 'battle',
    label: '战斗',
    items: [
      { key: 'combat', label: '战斗' },
      { key: 'zone', label: '秘境', disabled: true },
    ],
  },
];

describe('SideNav', () => {
  it('渲染全部分组与条目', () => {
    const { container } = render(<SideNav groups={groups} selectedKey="bag" onSelect={vi.fn()} />);

    const groupTitles = [...container.querySelectorAll('.ant-menu-item-group-title')].map(
      (node) => node.textContent,
    );
    expect(groupTitles).toEqual(['养成', '战斗']);

    const itemLabels = [...container.querySelectorAll('.ant-menu-item')].map((node) => node.textContent);
    // 「战斗」既是组名也是条目名，故断言条目集合整体
    expect(itemLabels).toEqual(['背包', '装备', '战斗', '秘境']);
  });

  it('selectedKey 对应项处于选中态', () => {
    render(<SideNav groups={groups} selectedKey="equip" onSelect={vi.fn()} />);
    const selected = screen.getByRole('menuitem', { name: '装备' });
    expect(selected.className).toContain('ant-menu-item-selected');
  });

  it('点击条目回调其 key', async () => {
    const onSelect = vi.fn();
    render(<SideNav groups={groups} selectedKey="bag" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('menuitem', { name: '装备' }));
    expect(onSelect).toHaveBeenCalledWith('equip');
  });

  it('禁用项不可点击、不回调', async () => {
    const onSelect = vi.fn();
    render(<SideNav groups={groups} selectedKey="bag" onSelect={onSelect} />);

    const disabledItem = screen.getByRole('menuitem', { name: '秘境' });
    expect(disabledItem.className).toContain('ant-menu-item-disabled');
    await userEvent.click(disabledItem);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('空分组不崩，标题与底部插槽渲染', () => {
    render(
      <SideNav
        groups={[]}
        selectedKey="none"
        onSelect={vi.fn()}
        title={<span>标题区</span>}
        footer={<span>底部区</span>}
      />,
    );
    expect(screen.getByTestId('side-nav-root')).toBeInTheDocument();
    expect(screen.getByText('标题区')).toBeInTheDocument();
    expect(screen.getByText('底部区')).toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('selectedKey 不在任何分组内时不选中任何条目', () => {
    const { container } = render(<SideNav groups={groups} selectedKey="unknown" onSelect={vi.fn()} />);
    expect(container.querySelectorAll('.ant-menu-item-selected')).toHaveLength(0);
  });
});
