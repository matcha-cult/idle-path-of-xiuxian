/**
 * ThemeToggle：一键亮/暗切换（受控）。
 * 覆盖：可读名称随态变化、点击回调相反态、禁用、键盘可达、自定义文案。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { THEME_TOGGLE_LABELS, type ThemeMode } from '../types.js';
import { ThemeToggle } from './index.js';

describe('ThemeToggle', () => {
  it('light 态：可读名称为「切换到暗色主题」，点击回调 dark', async () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="light" onChange={onChange} />);

    const button = screen.getByRole('button', { name: THEME_TOGGLE_LABELS.dark });
    expect(button).toBeInTheDocument();

    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('dark 态：可读名称为「切换到亮色主题」，点击回调 light', async () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="dark" onChange={onChange} />);

    const button = screen.getByRole('button', { name: THEME_TOGGLE_LABELS.light });
    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledWith('light');
  });

  it('键盘可达：Tab 聚焦后 Enter 触发切换', async () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="light" onChange={onChange} />);

    await userEvent.tab();
    expect(screen.getByTestId('theme-toggle')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('禁用态：不触发回调', async () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="light" onChange={onChange} disabled />);

    const button = screen.getByRole('button', { name: THEME_TOGGLE_LABELS.dark });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('自定义文案覆盖默认可读名称', () => {
    render(<ThemeToggle value="light" onChange={vi.fn()} label="换肤" />);
    expect(screen.getByRole('button', { name: '换肤' })).toBeInTheDocument();
  });

  it.each(['light', 'dark'] as ThemeMode[])('两种态都只渲染一个按钮（图标型）', (mode) => {
    render(<ThemeToggle value={mode} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
