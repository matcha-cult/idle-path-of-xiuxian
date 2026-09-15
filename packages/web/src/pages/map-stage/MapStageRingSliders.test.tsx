/**
 * `MapStageRingSliders` 单测 —— 滑杆是「调半径」这件事的唯一入口，所以断言两件事：
 * 每行显示的**当前值**必须就是环表里的值（读数不能骗人），以及**键盘可调**（顺便让 jsdom 能测它）。
 *
 * 为什么用键盘而不是模拟拖动：antd Slider 的拖动依赖 rc-slider 的测量与指针事件，
 * jsdom 里没有真实布局、拖不准；而 `keyboard` 默认开启（无障碍能力），左右方向键走一步 ——
 * 这既是真的交互路径，也是 jsdom 里唯一可靠的交互路径。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapStageRingSliders } from './MapStageRingSliders.js';
import { RING_RADIUS_LIMITS, adjustableRings } from './map-points.js';

const RINGS = adjustableRings(); // 外环（门）、二环（峰）；中心固定，不给滑杆

const handles = (container: HTMLElement): Element[] => [...container.querySelectorAll('[role="slider"]')];

describe('MapStageRingSliders', () => {
  it('⭐ 面板里带「复制环半径」按钮（把转录工作从用户手里接过来）', () => {
    render(<MapStageRingSliders rings={RINGS} onChange={vi.fn()} />);
    expect(screen.getByTestId('stage-ring-sliders')).toContainElement(screen.getByTestId('ring-export-button'));
    expect(screen.getByTestId('ring-export-button')).toHaveTextContent('复制环半径');
  });

  it('可调的环每个一行：显示名 + 当前半径（值来自环表，不硬编码）', () => {
    render(<MapStageRingSliders rings={RINGS} onChange={vi.fn()} />);
    expect(screen.getByTestId('ring-value-gate')).toHaveTextContent('10 格');
    expect(screen.getByTestId('ring-value-peak')).toHaveTextContent('9 格');
    expect(screen.getByTestId('ring-value-court')).toHaveTextContent('5 格');
    expect(screen.getByTestId('stage-ring-sliders')).toHaveTextContent('外环 · 四门');
    expect(screen.getByTestId('stage-ring-sliders')).toHaveTextContent('二环 · 八峰');
    expect(screen.getByTestId('stage-ring-sliders')).toHaveTextContent('内环 · 四院');
  });

  it('中心（主峰）不给滑杆 —— 地图原点不该被拖走', () => {
    render(<MapStageRingSliders rings={RINGS} onChange={vi.fn()} />);
    expect(RINGS.map((ring) => ring.key)).toEqual(['gate', 'peak', 'court']);
    expect(screen.queryByTestId('ring-value-summit')).toBeNull();
  });

  it('滑杆范围与步长来自数据口径（0 … 半幅、0.5 格一步）', () => {
    const { container } = render(<MapStageRingSliders rings={RINGS} onChange={vi.fn()} />);
    const [gate] = handles(container);
    expect(gate?.getAttribute('aria-valuemin')).toBe(String(RING_RADIUS_LIMITS.min));
    expect(gate?.getAttribute('aria-valuemax')).toBe(String(RING_RADIUS_LIMITS.max));
    expect(gate?.getAttribute('aria-valuenow')).toBe('10');
    expect(handles(container)).toHaveLength(3);
  });

  it('⭐ 键盘右方向键：按环上报「当前值 + 一步」（这就是拖动会走的那条回调）', () => {
    const onChange = vi.fn();
    const { container } = render(<MapStageRingSliders rings={RINGS} onChange={onChange} />);
    const [, peak] = handles(container);
    fireEvent.keyDown(peak as Element, { key: 'ArrowRight', keyCode: 39, which: 39 });
    expect(onChange).toHaveBeenCalledWith('peak', 9 + RING_RADIUS_LIMITS.step);
  });

  it('键盘左方向键同理（下调）', () => {
    const onChange = vi.fn();
    const { container } = render(<MapStageRingSliders rings={RINGS} onChange={onChange} />);
    const [gate] = handles(container);
    fireEvent.keyDown(gate as Element, { key: 'ArrowLeft', keyCode: 37, which: 37 });
    expect(onChange).toHaveBeenCalledWith('gate', 10 - RING_RADIUS_LIMITS.step);
  });

  it('上报的是**环的 key**，调用方据此写回 state（组件本身不存半径）', () => {
    const onChange = vi.fn();
    const { container } = render(<MapStageRingSliders rings={RINGS} onChange={onChange} />);
    fireEvent.keyDown(handles(container)[0] as Element, { key: 'ArrowRight', keyCode: 39, which: 39 });
    expect(onChange.mock.calls[0]?.[0]).toBe('gate');
  });
});
