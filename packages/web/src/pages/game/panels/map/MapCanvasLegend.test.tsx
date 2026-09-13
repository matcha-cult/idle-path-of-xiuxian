/**
 * `MapCanvasLegend`（视觉规格 v2）：环层=形状+语义色、可交互性=饱和度；
 * `compact` 只留可交互性；协议值不上屏。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapCanvasLegend } from './MapCanvasLegend.js';

describe('MapCanvasLegend', () => {
  it('缺省展示四档环层（形状即层级）+ 三条可交互性', () => {
    render(<MapCanvasLegend />);
    expect(screen.getByTestId('map-canvas-legend-ring-outer')).toHaveTextContent('外环山门（圆角方）');
    expect(screen.getByTestId('map-canvas-legend-ring-peaks')).toHaveTextContent('八峰（圆）');
    expect(screen.getByTestId('map-canvas-legend-ring-inner')).toHaveTextContent('内环功能（六边形）');
    expect(screen.getByTestId('map-canvas-legend-ring-summit')).toHaveTextContent('中央主峰（八角星）');
    expect(screen.getByTestId('map-canvas-legend-state-current')).toHaveTextContent('当前所在');
    expect(screen.getByTestId('map-canvas-legend-state-interactive')).toHaveTextContent('可交互');
    expect(screen.getByTestId('map-canvas-legend-state-locked')).toHaveTextContent('不可交互');
  });

  it('环层缩略图与画布画同一套形状（峰=圆 / 院与主峰=polygon / 门=rect）', () => {
    render(<MapCanvasLegend />);
    const figureOf = (tier: string): SVGElement => {
      const svg = screen.getByTestId(`map-canvas-legend-ring-${tier}`).querySelector('svg');
      return (svg as SVGElement).lastElementChild as SVGElement;
    };
    expect(figureOf('peaks').tagName.toLowerCase()).toBe('circle');
    expect(figureOf('inner').tagName.toLowerCase()).toBe('polygon');
    expect(figureOf('summit').tagName.toLowerCase()).toBe('polygon');
    expect((figureOf('summit').getAttribute('points') ?? '').trim().split(/\s+/)).toHaveLength(16);
    expect(figureOf('outer').tagName.toLowerCase()).toBe('rect');
  });

  it('compact（列表视图头部）只留可交互性，不列环层', () => {
    render(<MapCanvasLegend compact />);
    expect(screen.getByTestId('map-canvas-legend-state-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas-legend-ring-outer')).toBeNull();
  });

  it('不出现协议值原文（ring / kind / state 英文名不上屏）', () => {
    render(<MapCanvasLegend />);
    const text = document.body.textContent ?? '';
    for (const raw of ['outer', 'peaks', 'summit', 'secret_realm', 'waypoint', 'visited', 'known']) {
      expect(text).not.toContain(raw);
    }
  });
});
