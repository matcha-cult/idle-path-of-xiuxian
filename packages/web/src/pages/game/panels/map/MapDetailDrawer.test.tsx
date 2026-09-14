/**
 * `MapDetailDrawer` 单测：窄屏抽屉的开合、标题、详情插槽与常驻提示条。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MapDetailDrawer } from './MapDetailDrawer.js';

describe('MapDetailDrawer', () => {
  it('打开时渲染标题与详情插槽，并带上常驻提示条', () => {
    render(
      <MapDetailDrawer open title="后山峰" touch detail={<div data-testid="detail-slot">详情</div>} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('map-detail-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('detail-slot')).toBeInTheDocument();
    // 提示条与抽屉同生命周期（两者都是「面板底部」这一层）
    expect(screen.getByTestId('map-hint-bar')).toBeInTheDocument();
  });

  it('关闭时不渲染详情插槽', () => {
    render(
      <MapDetailDrawer
        open={false}
        title="后山峰"
        touch
        detail={<div data-testid="detail-slot">详情</div>}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('detail-slot')).toBeNull();
  });

  it('点关闭触发 onClose', async () => {
    const onClose = vi.fn();
    render(<MapDetailDrawer open title="后山峰" touch detail={null} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /close|关闭/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});