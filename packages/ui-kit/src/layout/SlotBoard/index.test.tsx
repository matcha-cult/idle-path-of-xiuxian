/**
 * SlotBoard：槽位标签 / 槽内内容 / 空槽占位、列数换算（固定 span 与响应式断点）、
 * tone 边框 token、dashed 开关，以及点击 / 键盘 / 可访问性。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { theme } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { SlotBoard, type SlotBoardItem } from './index.js';

const slot = (key: string, overrides: Partial<SlotBoardItem> = {}): SlotBoardItem => ({
  key,
  label: `槽位-${key}`,
  ...overrides,
});

describe('SlotBoard · 渲染', () => {
  it('正常渲染：槽位标签 + 槽内内容', () => {
    render(<SlotBoard slots={[slot('head', { item: <span>紫金冠</span> })]} />);

    expect(screen.getByTestId('slot-board-root')).toBeInTheDocument();
    expect(screen.getByTestId('slot-board-label')).toHaveTextContent('槽位-head');
    expect(screen.getByTestId('slot-board-item')).toHaveTextContent('紫金冠');
    expect(screen.queryByTestId('slot-board-empty')).toBeNull();
  });

  it('空槽走 empty 文案，缺省「空」', () => {
    const { unmount } = render(<SlotBoard slots={[slot('none')]} />);
    expect(screen.getByTestId('slot-board-empty')).toHaveTextContent('空');
    expect(screen.getByTestId('slot-board-slot')).toHaveAttribute('data-filled', 'false');
    unmount();

    render(<SlotBoard slots={[slot('none', { empty: '未装备', item: null })]} />);
    expect(screen.getByTestId('slot-board-empty')).toHaveTextContent('未装备');
  });

  it('slots=[] 渲染空网格且不崩', () => {
    render(<SlotBoard slots={[]} />);

    expect(screen.getByTestId('slot-board-root')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-board-slot')).toBeNull();
  });

  it('columns 为数字时用固定 span（4 列 → 每格 6）', () => {
    const { container } = render(<SlotBoard columns={4} slots={[slot('a'), slot('b')]} />);

    expect(container.querySelectorAll('.ant-col-6')).toHaveLength(2);
  });

  it('缺省 columns 按断点换算，余数摊给前几列使整行铺满 24', () => {
    const { container } = render(
      <SlotBoard slots={[slot('a'), slot('b'), slot('c'), slot('d'), slot('e')]} />,
    );

    // 2/3/4/5 列 → xs 12、sm 8、md 6、lg 5（余 4 摊给前 4 格，第 5 格 4）
    expect(container.querySelectorAll('.ant-col-xs-12')).toHaveLength(5);
    expect(container.querySelectorAll('.ant-col-sm-8')).toHaveLength(5);
    expect(container.querySelectorAll('.ant-col-md-6')).toHaveLength(5);
    expect(container.querySelectorAll('.ant-col-lg-5')).toHaveLength(4);
    expect(container.querySelectorAll('.ant-col-lg-4')).toHaveLength(1);
  });

  it('columns 对象缺省键由默认值补齐，非法列数按 1 列兜底', () => {
    const { container } = render(<SlotBoard columns={{ lg: 2, xl: 0 }} slots={[slot('a'), slot('b')]} />);

    // lg:2 → 12；xl:0 → 按 1 列 → 24；xs 仍取缺省 2 → 12
    expect(container.querySelectorAll('.ant-col-lg-12')).toHaveLength(2);
    expect(container.querySelectorAll('.ant-col-xl-24')).toHaveLength(2);
    expect(container.querySelectorAll('.ant-col-xs-12')).toHaveLength(2);
  });

  it('columns 为 NaN 或超出 24 时夹取到合法范围（1 列 / 24 列），不产生非法 span', () => {
    const { container, unmount } = render(<SlotBoard columns={Number.NaN} slots={[slot('a')]} />);
    expect(container.querySelectorAll('.ant-col-24')).toHaveLength(1);
    expect(container.querySelector('.ant-col-0')).toBeNull();

    unmount();
    const { container: over } = render(<SlotBoard columns={30} slots={[slot('a')]} />);
    expect(over.querySelectorAll('.ant-col-1')).toHaveLength(1);
  });

  it('tone 只影响边框色且取自 token（equip / skill / 缺省各不相同）', () => {
    const token = theme.getDesignToken();
    const { unmount } = render(<SlotBoard tone="equip" slots={[slot('a')]} />);
    expect(screen.getByTestId('slot-board-slot')).toHaveStyle({ borderColor: token.colorPrimaryBorder });
    unmount();

    const { unmount: unmount2 } = render(<SlotBoard tone="skill" slots={[slot('a')]} />);
    expect(screen.getByTestId('slot-board-slot')).toHaveStyle({ borderColor: token.colorWarningBorder });
    unmount2();

    render(<SlotBoard slots={[slot('a')]} />);
    expect(screen.getByTestId('slot-board-slot')).toHaveStyle({ borderColor: token.colorBorder });
  });

  it('dashed 缺省时空槽为虚线，dashed=false 或已有物品时为实线', () => {
    const { unmount } = render(<SlotBoard slots={[slot('a')]} />);
    expect(screen.getByTestId('slot-board-slot')).toHaveStyle({ borderStyle: 'dashed' });
    unmount();

    const { unmount: unmount2 } = render(<SlotBoard dashed={false} slots={[slot('a')]} />);
    expect(screen.getByTestId('slot-board-slot')).toHaveStyle({ borderStyle: 'solid' });
    unmount2();

    render(<SlotBoard slots={[slot('a', { item: <span>剑</span> })]} />);
    expect(screen.getByTestId('slot-board-slot')).toHaveStyle({ borderStyle: 'solid' });
  });
});

describe('SlotBoard · 交互与可访问性', () => {
  it('onClick 存在时整格可点：鼠标点击触发一次', async () => {
    const onClick = vi.fn();
    render(<SlotBoard slots={[slot('head', { item: <span>紫金冠</span>, onClick })]} />);

    await userEvent.click(screen.getByTestId('slot-board-slot'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('可访问性：具备 button 角色与可访问名称，Enter / Space 均可触发', async () => {
    const onClick = vi.fn();
    render(<SlotBoard slots={[slot('head', { item: <span>紫金冠</span>, onClick })]} />);

    const cell = screen.getByRole('button', { name: /槽位-head/ });
    expect(cell).toHaveAttribute('tabindex', '0');
    cell.focus();
    expect(cell).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);

    // 其它按键不触发（避免空格滚动等误触）
    await userEvent.keyboard('{Escape}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('无 onClick 时不带按钮语义（无 role / tabindex）', () => {
    render(<SlotBoard slots={[slot('head', { item: <span>紫金冠</span> })]} />);

    const cell = screen.getByTestId('slot-board-slot');
    expect(cell).not.toHaveAttribute('role');
    expect(cell).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
