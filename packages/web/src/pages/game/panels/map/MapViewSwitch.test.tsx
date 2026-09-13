/**
 * `MapViewSwitch`：画布 / 列表切换（§12.2「始终保留列表视图」）。
 * 边界：非 'list' 的取值一律按 'canvas'（协议 / 事件里不会出现第三种值）。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MapViewSwitch } from './MapViewSwitch.js';

describe('MapViewSwitch', () => {
  it('两个选项：画布 / 列表', () => {
    render(<MapViewSwitch value="canvas" onChange={vi.fn()} />);
    const root = screen.getByTestId('map-view-switch');
    expect(within(root).getByText('画布')).toBeInTheDocument();
    expect(within(root).getByText('列表')).toBeInTheDocument();
  });

  it('点「列表」回调 list；点「画布」回调 canvas（受控：分别以对应初值渲染）', async () => {
    const toList = vi.fn();
    const { unmount } = render(<MapViewSwitch value="canvas" onChange={toList} />);
    await userEvent.click(within(screen.getByTestId('map-view-switch')).getByText('列表'));
    expect(toList).toHaveBeenCalledWith('list');
    unmount();

    const toCanvas = vi.fn();
    render(<MapViewSwitch value="list" onChange={toCanvas} />);
    await userEvent.click(within(screen.getByTestId('map-view-switch')).getByText('画布'));
    expect(toCanvas).toHaveBeenCalledWith('canvas');
  });

  it('当前值高亮（受控）', () => {
    render(<MapViewSwitch value="list" onChange={vi.fn()} />);
    const selected = screen.getByTestId('map-view-switch').querySelector('.ant-segmented-item-selected');
    expect(selected?.textContent).toBe('列表');
  });
});
