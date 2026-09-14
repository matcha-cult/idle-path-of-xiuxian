/**
 * `CanvasGraphPin` 单测 —— 枢纽是**命中判定的唯一钩子**（`data-canvas-item`）与
 * **拖动抑制的第 2 条**（`draggable={false}` + `onDragStart` preventDefault）所在，
 * 两条都属于「删了会回归」的契约，必须被测试守住。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasGraphPin } from './index.js';

const base = {
  itemKey: 'qy_gate_n',
  row: 0,
  col: 10,
  content: <span>北门</span>,
  dragging: false,
  onPick: () => undefined,
  register: () => undefined,
};

describe('渲染与语义', () => {
  it('渲染内容，并挂上命中钩子 data-canvas-item', () => {
    render(<CanvasGraphPin {...base} />);
    const pin = screen.getByTestId('canvas-graph-item-qy_gate_n');
    expect(pin).toHaveAttribute('data-canvas-item', 'qy_gate_n');
    expect(pin).toHaveTextContent('北门');
  });

  it('可点击语义：role=button + tabIndex=0 + 无障碍名称回落到 key', () => {
    render(<CanvasGraphPin {...base} />);
    const pin = screen.getByRole('button');
    expect(pin).toHaveAttribute('tabindex', '0');
    expect(pin).toHaveAttribute('aria-label', 'qy_gate_n');
  });

  it('有 title 时同时作为悬停标题与无障碍名称（协议字段不上屏）', () => {
    render(<CanvasGraphPin {...base} title="北门 · 外环 · 已到达" />);
    const pin = screen.getByRole('button');
    expect(pin).toHaveAttribute('aria-label', '北门 · 外环 · 已到达');
    expect(pin).toHaveAttribute('title', '北门 · 外环 · 已到达');
  });

  it('selected 反映到 data-selected（视觉高亮由 content 自己决定）', () => {
    const { rerender } = render(<CanvasGraphPin {...base} />);
    expect(screen.getByTestId('canvas-graph-item-qy_gate_n')).not.toHaveAttribute('data-selected');
    rerender(<CanvasGraphPin {...base} selected />);
    expect(screen.getByTestId('canvas-graph-item-qy_gate_n')).toHaveAttribute('data-selected', 'true');
  });

  it('坐标非有限 → 不渲染（NaN 定位会让枢纽静默飘出屏幕）', () => {
    render(<CanvasGraphPin {...base} row={Number.NaN} />);
    expect(screen.queryByTestId('canvas-graph-item-qy_gate_n')).toBeNull();
  });
});

describe('禁用态', () => {
  it('disabled：不可聚焦、标记 aria-disabled、降透明度、光标 not-allowed', () => {
    render(<CanvasGraphPin {...base} disabled />);
    const pin = screen.getByTestId('canvas-graph-item-qy_gate_n');
    expect(pin).toHaveAttribute('tabindex', '-1');
    expect(pin).toHaveAttribute('aria-disabled', 'true');
    expect(pin.style.opacity).toBe('0.45');
    expect(pin.style.cursor).toBe('not-allowed');
  });

  it('拖动态光标切成 grabbing（可点击时）', () => {
    render(<CanvasGraphPin {...base} dragging />);
    expect(screen.getByTestId('canvas-graph-item-qy_gate_n').style.cursor).toBe('grabbing');
  });
});

describe('键盘 = 轻点（与鼠标点击等价，没有「双击直达」这种键盘语义）', () => {
  it('Enter 触发 onPick', () => {
    const onPick = vi.fn();
    render(<CanvasGraphPin {...base} onPick={onPick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('Space 触发 onPick，并阻止默认滚动', () => {
    const onPick = vi.fn();
    render(<CanvasGraphPin {...base} onPick={onPick} />);
    const pin = screen.getByRole('button');
    const allowed = fireEvent.keyDown(pin, { key: ' ' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(allowed).toBe(false); // preventDefault → fireEvent 返回 false
  });

  it('其它按键不触发', () => {
    const onPick = vi.fn();
    render(<CanvasGraphPin {...base} onPick={onPick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('禁用时键盘也不触发', () => {
    const onPick = vi.fn();
    render(<CanvasGraphPin {...base} disabled onPick={onPick} />);
    fireEvent.keyDown(screen.getByTestId('canvas-graph-item-qy_gate_n'), { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('拖动抑制（19 §2，删了会回归「按住枢纽文字把文字拖出去」）', () => {
  it('draggable=false 且 dragstart 被 preventDefault', () => {
    render(<CanvasGraphPin {...base} />);
    const pin = screen.getByTestId('canvas-graph-item-qy_gate_n');
    expect(pin).toHaveAttribute('draggable', 'false');
    expect(fireEvent.dragStart(pin)).toBe(false); // 被 preventDefault
  });
});

describe('register（父级据此写 transform）', () => {
  it('挂载时注册 DOM 节点，卸载时以 null 反注册', () => {
    const register = vi.fn();
    const { unmount } = render(<CanvasGraphPin {...base} register={register} />);
    expect(register).toHaveBeenLastCalledWith(expect.any(HTMLDivElement));
    unmount();
    expect(register).toHaveBeenLastCalledWith(null);
  });

  it('不渲染时不注册（没有 DOM 就没有位置要写）', () => {
    const register = vi.fn();
    render(<CanvasGraphPin {...base} col={Number.POSITIVE_INFINITY} register={register} />);
    expect(register).not.toHaveBeenCalled();
  });
});
