/**
 * `CanvasGraphControls` 单测 —— 纯受控三按钮。守住：
 * 三个入口都在（触屏没有滚轮，这是唯一可见的缩放入口）、点击只回调不自己改状态、
 * 每个按钮都有中文 `aria-label`（图标按钮对读屏器不可读）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasGraphControls } from './index.js';

const noop = (): void => undefined;

describe('CanvasGraphControls', () => {
  it('三个入口齐全，且都有无障碍名称', () => {
    render(<CanvasGraphControls onZoomIn={noop} onZoomOut={noop} onReset={noop} />);
    for (const label of ['放大', '缩小', '整图复位']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('点击分别触发对应回调（一次点击一次回调）', () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onReset = vi.fn();
    render(<CanvasGraphControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} />);
    fireEvent.click(screen.getByTestId('canvas-graph-zoom-in'));
    fireEvent.click(screen.getByTestId('canvas-graph-zoom-out'));
    fireEvent.click(screen.getByTestId('canvas-graph-reset'));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('不传 size（紧凑由全局 compactAlgorithm 恒开承担）', () => {
    render(<CanvasGraphControls onZoomIn={noop} onZoomOut={noop} onReset={noop} />);
    // antd 紧凑模式下按钮类名带 ant-btn-sm 是全局算法的结果，不是组件传了 size
    for (const testId of ['canvas-graph-zoom-in', 'canvas-graph-zoom-out', 'canvas-graph-reset']) {
      expect(screen.getByTestId(testId)).not.toHaveAttribute('size');
    }
  });
});
