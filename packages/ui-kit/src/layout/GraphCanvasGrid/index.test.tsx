/**
 * GraphCanvasGrid：交叉点点阵数量、0-based 轴标、非法 rows/cols 不崩。
 * 组件本身是 `<g>`（SVG 片段），因此必须包在 `<svg>` 里渲染。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GraphCanvasGrid } from './index.js';

function renderGrid(element: React.ReactElement) {
  return render(<svg>{element}</svg>);
}

describe('GraphCanvasGrid', () => {
  it('(n+1)² 个交叉点、(n+1) 个列号与行号、成对网格线', () => {
    renderGrid(<GraphCanvasGrid rows={4} cols={4} cellPx={48} />);
    expect(screen.getByTestId('graph-canvas-grid')).toHaveAttribute('data-grid', '4x4');
    expect(screen.getAllByTestId('graph-canvas-grid-point')).toHaveLength(25);
    expect(screen.getAllByTestId('graph-canvas-grid-line')).toHaveLength(10);
    expect(screen.getAllByTestId('graph-canvas-axis-col').map((el) => el.textContent)).toEqual([
      '0', '1', '2', '3', '4',
    ]);
    expect(screen.getAllByTestId('graph-canvas-axis-row').map((el) => el.textContent)).toEqual([
      '0', '1', '2', '3', '4',
    ]);
  });

  it('交叉点落在「格号 × cellPx」上：(0,0) 与 (4,4) 的对角', () => {
    renderGrid(<GraphCanvasGrid rows={4} cols={4} cellPx={48} />);
    const points = screen.getAllByTestId('graph-canvas-grid-point');
    const first = points[0];
    const last = points[points.length - 1];
    expect(first).toHaveAttribute('cx', '0');
    expect(first).toHaveAttribute('cy', '0');
    expect(last).toHaveAttribute('cx', String(4 * 48));
    expect(last).toHaveAttribute('cy', String(4 * 48));
  });

  it('rows/cols 为 0 → 只有 1 个交叉点与 1 组轴标（仍是合法画布）', () => {
    renderGrid(<GraphCanvasGrid rows={0} cols={0} cellPx={48} />);
    expect(screen.getAllByTestId('graph-canvas-grid-point')).toHaveLength(1);
    expect(screen.getAllByTestId('graph-canvas-axis-col')).toHaveLength(1);
  });

  it('rows/cols 非法（负数 / NaN）不崩，也不产出 NaN 坐标', () => {
    renderGrid(<GraphCanvasGrid rows={-3} cols={Number.NaN} cellPx={48} />);
    expect(screen.getByTestId('graph-canvas-grid')).toHaveAttribute('data-grid', '0x0');
    expect(screen.getAllByTestId('graph-canvas-grid-point')).toHaveLength(1);
    for (const line of screen.getAllByTestId('graph-canvas-grid-line')) {
      expect(line.getAttribute('x1')).not.toContain('NaN');
    }
  });
});
