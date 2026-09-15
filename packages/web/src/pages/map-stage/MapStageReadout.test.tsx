/**
 * `MapStageReadout` 单测 —— 这一段是**排查通道 + 点位验收物**，所以断言的重点不是"好看"，
 * 而是「用户在屏幕上看到的那几个数字，在任何状态下都必须是可抄写的事实」：
 * 世界原点、悬停格、几何读数，以及 9 个点位的坐标（含斜向峰的小数格点）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapStageReadout } from './MapStageReadout.js';
import { resolveMapPoints } from './map-points.js';
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

const POINTS = resolveMapPoints();

describe('MapStageReadout', () => {
  it('把悬停格与几何印成可读文字（排查时可直接抄给开发者）', () => {
    render(<MapStageReadout hover={{ col: 7, row: 3 }} metrics={METRICS} points={POINTS} />);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 07 / 行 03');
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('(362, 362) px');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('16 px');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('724 × 724 CSS');
    expect(screen.getByTestId('stage-bitmap')).toHaveTextContent('1448 × 1448');
    expect(screen.getByTestId('stage-dpr')).toHaveTextContent('2');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
  });

  it('⭐ 9 个点位全部上屏（1 主峰 + 8 功能峰），坐标是世界口径', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} />);
    expect(screen.getByTestId('stage-point-summit')).toHaveTextContent('主峰 (0, 0)');
    expect(screen.getByTestId('stage-point-peak_1')).toHaveTextContent('功能峰·东 (9, 0)');
    expect(screen.getByTestId('stage-point-peak_3')).toHaveTextContent('功能峰·北 (0, 9)');
    expect(screen.getByTestId('stage-point-peak_5')).toHaveTextContent('功能峰·西 (-9, 0)');
    expect(screen.getByTestId('stage-point-peak_7')).toHaveTextContent('功能峰·南 (0, -9)');
    expect(screen.getByTestId('stage-points').children).toHaveLength(9);
  });

  it('⭐ 斜向峰显示成 1 位小数（6.4）——它本来就不是格点上的整数坐标', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} />);
    expect(screen.getByTestId('stage-point-peak_2')).toHaveTextContent('功能峰·东北 (6.4, 6.4)');
    expect(screen.getByTestId('stage-point-peak_2')).toHaveTextContent('6.4, 6.4');
  });

  it('说明里点明「环 + 角度」的存放口径与小数格点这两件事', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} />);
    const note = screen.getByTestId('stage-points-note');
    expect(note).toHaveTextContent('8 等分');
    expect(note).toHaveTextContent('27.36');
    expect(note).toHaveTextContent('不落库');
  });

  it('没有悬停 ⇒ 显示 —，而不是 0 / NaN / 空白', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} />);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');
  });

  it('还没量出尺寸（metrics=null）⇒ 几何全为 —，但 DPR 仍可报（它不是量出来的）', () => {
    render(<MapStageReadout hover={null} metrics={null} points={POINTS} />);
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-bitmap')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-dpr')).toHaveTextContent('—');
  });

  it('空间不足（usable=false）⇒ 显示 —：说明"窗口太小"而不是"画布坏了"', () => {
    render(
      <MapStageReadout
        hover={null}
        metrics={{ ...METRICS, cellPx: 0, width: 0, height: 0, usable: false }}
        points={POINTS}
      />,
    );
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('—');
  });

  it('列/行都是两位补零（0 显示为 00，便于和轴标对齐着读）', () => {
    render(<MapStageReadout hover={{ col: 0, row: 0 }} metrics={METRICS} points={POINTS} />);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 00 / 行 00');
  });
});
