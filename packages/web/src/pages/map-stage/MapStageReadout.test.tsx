/**
 * `MapStageReadout` 单测 —— 这一段是**排查通道 + 点位验收物**，所以断言的重点不是"好看"，
 * 而是「用户在屏幕上看到的那几个数字，在任何状态下都必须是可抄写的事实」：
 * 世界原点、悬停格、几何与环境读数、环的口径（含**被滑杆改过的当前值**），以及 13 个点位的坐标。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapStageReadout } from './MapStageReadout.js';
import { MAP_RINGS, resolveMapPoints, withRingRadii } from './map-points.js';
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
    render(
      <MapStageReadout hover={{ col: 7, row: 3 }} metrics={METRICS} points={POINTS} rings={MAP_RINGS} />,
    );
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 07 / 行 03');
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('(362, 362) px');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('16 px');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('724 × 724 CSS');
    expect(screen.getByTestId('stage-bitmap')).toHaveTextContent('1448 × 1448');
    expect(screen.getByTestId('stage-dpr')).toHaveTextContent('2');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
  });

  it('⭐ 环读数用用户口径的名字 + 每个环挂几个点（外环/二环/中心，虚实也标出来）', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} rings={MAP_RINGS} />);
    const rings = screen.getByTestId('stage-rings');
    expect(rings).toHaveTextContent('外环 · 四门 r10（虚线）×4');
    expect(rings).toHaveTextContent('二环 · 八峰 r9（实线）×8');
    expect(rings).toHaveTextContent('中心 · 主峰 r0（实线）×1');
  });

  it('⭐ 环读数报的是**当前**半径：滑杆一改，读数立刻跟着变（否则读数会骗人）', () => {
    render(
      <MapStageReadout
        hover={null}
        metrics={METRICS}
        points={resolveMapPoints(undefined, withRingRadii({ peak: 12.5, gate: 14 }))}
        rings={withRingRadii({ peak: 12.5, gate: 14 })}
      />,
    );
    expect(screen.getByTestId('stage-rings')).toHaveTextContent('外环 · 四门 r14（虚线）×4');
    expect(screen.getByTestId('stage-rings')).toHaveTextContent('二环 · 八峰 r12.5（实线）×8');
  });

  it('⭐ 13 个点位全部上屏（1 主峰 + 8 八峰 + 4 宗门门），坐标是世界口径', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} rings={MAP_RINGS} />);
    expect(screen.getByTestId('stage-point-summit')).toHaveTextContent('主峰 (0, 0)');
    expect(screen.getByTestId('stage-point-peak_1')).toHaveTextContent('八峰·一 (8.3, 3.4)');
    expect(screen.getByTestId('stage-point-peak_3')).toHaveTextContent('八峰·三 (-3.4, 8.3)');
    expect(screen.getByTestId('stage-point-gate_1')).toHaveTextContent('宗门·东门 (10, 0)');
    expect(screen.getByTestId('stage-point-gate_2')).toHaveTextContent('宗门·北门 (0, 10)');
    expect(screen.getByTestId('stage-points').children).toHaveLength(13);
  });

  it('⭐ 四门落在四个正方向、八峰落在两个方位之间（相位 22.5° 的直观体现）', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} rings={MAP_RINGS} />);
    expect(screen.getByTestId('stage-point-gate_3')).toHaveTextContent('宗门·西门 (-10, 0)');
    expect(screen.getByTestId('stage-point-gate_4')).toHaveTextContent('宗门·南门 (0, -10)');
    expect(screen.getByTestId('stage-point-peak_5')).toHaveTextContent('八峰·五 (-8.3, -3.4)');
  });

  it('说明里点明「环 + 角度」的存放口径、小数格点、以及滑杆只改会话', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} rings={MAP_RINGS} />);
    const note = screen.getByTestId('stage-points-note');
    expect(note).toHaveTextContent('8 等分');
    expect(note).toHaveTextContent('错开半个扇区');
    expect(note).toHaveTextContent('29.31');
    expect(note).toHaveTextContent('不落库');
    expect(note).toHaveTextContent('滑杆只改本次会话');
  });

  it('没有悬停 ⇒ 显示 —，而不是 0 / NaN / 空白', () => {
    render(<MapStageReadout hover={null} metrics={METRICS} points={POINTS} rings={MAP_RINGS} />);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');
  });

  it('还没量出尺寸（metrics=null）⇒ 几何全为 —，但 DPR 仍可报（它不是量出来的）', () => {
    render(<MapStageReadout hover={null} metrics={null} points={POINTS} rings={MAP_RINGS} />);
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
        rings={MAP_RINGS}
      />,
    );
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('—');
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('—');
  });

  it('列/行都是两位补零（0 显示为 00，便于和轴标对齐着读）', () => {
    render(
      <MapStageReadout hover={{ col: 0, row: 0 }} metrics={METRICS} points={POINTS} rings={MAP_RINGS} />,
    );
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 00 / 行 00');
  });
});
