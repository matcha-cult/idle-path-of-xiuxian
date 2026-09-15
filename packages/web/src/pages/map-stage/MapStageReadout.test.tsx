/**
 * `MapStageReadout` 单测 —— 这一段是**排查通道**，所以断言的重点不是"好看"，
 * 而是「用户在屏幕上看到的那几个数字，在任何状态下都必须是可抄写的事实」。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapStageReadout } from './MapStageReadout.js';
import type { GridMetrics } from '@idle-path/ui-kit';

const METRICS: GridMetrics = {
  cellPx: 16,
  width: 724,
  height: 724,
  bitmapWidth: 1448,
  bitmapHeight: 1448,
  dpr: 2,
  axisLineCount: 43,
  centerX: 362,
  centerY: 362,
  usable: true,
};

describe('MapStageReadout', () => {
  it('把悬停格与几何印成可读文字（排查时可直接抄给开发者）', () => {
    render(<MapStageReadout hover={{ col: 7, row: 3 }} metrics={METRICS} />);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 07 / 行 03');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('16 px');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('724 × 724 CSS');
    expect(screen.getByTestId('stage-bitmap')).toHaveTextContent('1448 × 1448');
    expect(screen.getByTestId('stage-dpr')).toHaveTextContent('2');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
  });

  it('⭐ 中心圆可核对：「圆心 (x, y) · Ø 格宽」—— 让"直径 = 1 格"在屏幕上可验', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} />);
    expect(screen.getByTestId('stage-mark')).toHaveTextContent('(362, 362) · Ø 16 px');
  });

  it('没有悬停 ⇒ 显示 —，而不是 0 / NaN / 空白', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} />);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');
  });

  it('还没量出尺寸（metrics=null）⇒ 几何全为 —，但 DPR 仍可报（它不是量出来的）', () => {
    render(<MapStageReadout hover={null} metrics={null} />);
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-bitmap')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-mark')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-dpr')).toHaveTextContent('—');
  });

  it('空间不足（usable=false）⇒ 显示 —：说明"窗口太小"而不是"画布坏了"', () => {
    render(<MapStageReadout hover={null} metrics={{ ...METRICS, cellPx: 0, width: 0, height: 0, usable: false }} />);
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-mark')).toHaveTextContent('—');
  });

  it('列/行都是两位补零（0 显示为 00，便于和轴标对齐着读）', () => {
    render(<MapStageReadout hover={{ col: 0, row: 0 }} metrics={METRICS} />);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 00 / 行 00');
  });
});
