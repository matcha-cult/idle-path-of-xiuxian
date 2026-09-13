/**
 * ActionBar：直出/折叠溢出、hidden、loadingKey、confirm 二次确认、空数组与 max 边界。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar, type ActionDescriptor } from './index.js';

function makeActions(count: number): ActionDescriptor[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `a${index + 1}`,
    label: `动作${index + 1}`,
    onClick: vi.fn(),
  }));
}

/**
 * 打开「更多」溢出菜单（复用同一 user 实例，避免指针状态分裂）。
 *
 * 注：antd v6 的 Button 会在两个汉字之间插入空格（`更 多`），故用 `\s*` 匹配可读名称。
 */
async function openOverflow(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /更\s*多/ }));
}

describe('ActionBar · 直出与折叠', () => {
  it('动作数 ≤ max 时全部直出，且不渲染「更多」', () => {
    render(<ActionBar actions={makeActions(3)} />);

    expect(screen.getByTestId('action-bar-root')).toBeInTheDocument();
    expect(screen.getByTestId('action-a1')).toHaveTextContent('动作1');
    expect(screen.getByTestId('action-a2')).toBeInTheDocument();
    expect(screen.getByTestId('action-a3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /更\s*多/ })).not.toBeInTheDocument();
  });

  it('动作数 > max 时超出的折叠进「更多」，点击菜单项触发对应 onClick', async () => {
    const user = userEvent.setup();
    const actions = makeActions(4);
    render(<ActionBar actions={actions} max={2} />);

    expect(screen.getByTestId('action-a1')).toBeInTheDocument();
    expect(screen.getByTestId('action-a2')).toBeInTheDocument();
    expect(screen.queryByTestId('action-a3')).not.toBeInTheDocument();

    await openOverflow(user);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('动作3')).toBeInTheDocument();
    expect(within(menu).getByText('动作4')).toBeInTheDocument();

    await user.click(within(menu).getByText('动作4'));
    expect(actions[3]?.onClick).toHaveBeenCalledTimes(1);
    expect(actions[2]?.onClick).not.toHaveBeenCalled();
  });

  it('max<=0 时全部进溢出菜单（含默认 max=3 的越界用法）', async () => {
    const user = userEvent.setup();
    const actions = makeActions(2);
    render(<ActionBar actions={actions} max={0} />);

    expect(screen.queryByTestId('action-a1')).not.toBeInTheDocument();
    await openOverflow(user);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('动作1')).toBeInTheDocument();
    expect(within(menu).getByText('动作2')).toBeInTheDocument();
  });

  it('actions=[] 渲染空容器且不抛错', () => {
    render(<ActionBar actions={[]} />);

    expect(screen.getByTestId('action-bar-root')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByTestId('action-bar-root').textContent).toBe('');
  });
});

describe('ActionBar · hidden / disabled / loading', () => {
  it('hidden 动作既不渲染按钮也不进溢出菜单', async () => {
    const user = userEvent.setup();
    const actions: ActionDescriptor[] = [
      { key: 'a1', label: '动作1', onClick: vi.fn() },
      { key: 'a2', label: '隐藏动作', hidden: true, onClick: vi.fn() },
      { key: 'a3', label: '动作3', onClick: vi.fn() },
      { key: 'a4', label: '动作4', onClick: vi.fn() },
    ];
    render(<ActionBar actions={actions} max={1} />);

    expect(screen.getByTestId('action-a1')).toBeInTheDocument();
    expect(screen.queryByText('隐藏动作')).not.toBeInTheDocument();
    await openOverflow(user);

    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByText('隐藏动作')).not.toBeInTheDocument();
    expect(within(menu).getByText('动作3')).toBeInTheDocument();
    expect(within(menu).getByText('动作4')).toBeInTheDocument();
  });

  it('全部 hidden 时不渲染「更多」（溢出为空）', () => {
    const actions: ActionDescriptor[] = [
      { key: 'a1', label: '动作1', hidden: true, onClick: vi.fn() },
      { key: 'a2', label: '动作2', hidden: true, onClick: vi.fn() },
    ];
    render(<ActionBar actions={actions} max={1} />);

    expect(screen.queryByTestId('action-a1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /更\s*多/ })).not.toBeInTheDocument();
  });

  it('disabled 动作透传禁用，且不触发 onClick', async () => {
    const onClick = vi.fn();
    render(<ActionBar actions={[{ key: 'a1', label: '动作1', disabled: true, onClick }]} />);

    const button = screen.getByTestId('action-a1');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loadingKey 命中的按钮 loading 且 disabled', () => {
    render(<ActionBar actions={makeActions(2)} loadingKey="a2" />);

    const loadingButton = screen.getByTestId('action-a2');
    expect(loadingButton).toHaveClass('ant-btn-loading');
    expect(loadingButton).toBeDisabled();
    expect(screen.getByTestId('action-a1')).not.toBeDisabled();
  });
});

describe('ActionBar · confirm 二次确认', () => {
  it('点击按钮只打开确认框，确认后才调用 onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ActionBar
        actions={[
          {
            key: 'break',
            label: '突破',
            danger: true,
            confirm: { title: '确认突破？', description: '失败将损失修为' },
            onClick,
          },
        ]}
      />,
    );

    await user.click(screen.getByTestId('action-break'));
    expect(onClick).not.toHaveBeenCalled();
    expect(await screen.findByText('确认突破？')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^(OK|确定)$/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('确认框取消时不调用 onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ActionBar actions={[{ key: 'break', label: '突破', confirm: { title: '确认突破？' }, onClick }]} />);

    await user.click(screen.getByTestId('action-break'));
    await user.click(await screen.findByRole('button', { name: /^(Cancel|取消)$/ }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
