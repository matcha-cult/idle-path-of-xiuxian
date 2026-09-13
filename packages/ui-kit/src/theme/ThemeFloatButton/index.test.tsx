/**
 * ThemeFloatButton：与 ThemeToggle 同语义的悬浮呈现（受控）。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { THEME_TOGGLE_LABELS } from '../types.js';
import { ThemeFloatButton } from './index.js';

describe('ThemeFloatButton', () => {
  it('light 态：可读名称为切换到暗色，点击回调 dark', async () => {
    const onChange = vi.fn();
    render(<ThemeFloatButton value="light" onChange={onChange} />);

    const button = screen.getByRole('button', { name: THEME_TOGGLE_LABELS.dark });
    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('dark 态：点击回调 light', async () => {
    const onChange = vi.fn();
    render(<ThemeFloatButton value="dark" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: THEME_TOGGLE_LABELS.light }));
    expect(onChange).toHaveBeenCalledWith('light');
  });

  it('自定义文案与位置', () => {
    render(<ThemeFloatButton value="light" onChange={vi.fn()} label="换肤" right={8} bottom={8} />);
    const button = screen.getByRole('button', { name: '换肤' });
    expect(button).toBeInTheDocument();
    expect(button.closest('.ant-float-btn')).toHaveStyle({ right: '8px', bottom: '8px' });
  });
});
