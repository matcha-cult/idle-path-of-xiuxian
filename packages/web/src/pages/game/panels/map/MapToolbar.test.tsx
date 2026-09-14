/**
 * `MapToolbar` 单测：单图不出现换图下拉、多图出现并回传 code、视图切换与刷新回传。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MapToolbar } from './MapToolbar.js';

function setup(overrides: Partial<Parameters<typeof MapToolbar>[0]> = {}) {
  const props = {
    maps: [{ code: 'map_qingyun', name: '青云宗' }],
    selectedMapCode: 'map_qingyun',
    onSelectMap: vi.fn(),
    view: 'canvas' as const,
    onViewChange: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<MapToolbar {...props} />);
  return props;
}

describe('MapToolbar', () => {
  it('只有一张图时不渲染换图下拉（避免无意义控件）', () => {
    setup();

    // 注：视图切换本身就是一个 Segmented（role=radiogroup），所以这里断言「只有它一个」
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
    expect(screen.queryByText('山下凡尘')).toBeNull();
    expect(screen.getByTestId('map-view-switch')).toBeInTheDocument();
    expect(screen.getByTestId('map-refresh')).toBeInTheDocument();
  });

  it('多张图时渲染换图下拉，选择后回传 code', async () => {
    const props = setup({
      maps: [
        { code: 'map_qingyun', name: '青云宗' },
        { code: 'map_fanchen', name: '山下凡尘' },
      ],
    });

    await userEvent.click(screen.getByText('山下凡尘'));

    expect(props.onSelectMap).toHaveBeenCalledWith('map_fanchen');
  });

  it('视图切换回传 list', async () => {
    const props = setup();

    await userEvent.click(screen.getByText('列表'));

    expect(props.onViewChange).toHaveBeenCalledWith('list');
  });

  it('点刷新触发 onRefresh（面板据此整图重载）', async () => {
    const props = setup();

    await userEvent.click(screen.getByTestId('map-refresh'));

    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });
});