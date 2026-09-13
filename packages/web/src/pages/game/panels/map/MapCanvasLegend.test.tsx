/**
 * `MapCanvasLegend`：四态齐全、可隐藏「未发现」、紧凑模式不展示枢纽类型、
 * 走同一份文案（协议值不上屏）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapCanvasLegend } from './MapCanvasLegend.js';

describe('MapCanvasLegend', () => {
  it('缺省展示四态 + 四类枢纽', () => {
    render(<MapCanvasLegend />);
    expect(screen.getByTestId('map-canvas-legend-state-current')).toHaveTextContent('当前所在');
    expect(screen.getByTestId('map-canvas-legend-state-visited')).toHaveTextContent('已到达');
    expect(screen.getByTestId('map-canvas-legend-state-known')).toHaveTextContent('已知未到达');
    expect(screen.getByTestId('map-canvas-legend-state-unknown')).toHaveTextContent('未发现');
    expect(screen.getByTestId('map-canvas-legend-kind-waypoint')).toHaveTextContent('传送点');
    expect(screen.getByTestId('map-canvas-legend-kind-secret_realm')).toHaveTextContent('秘境');
    expect(screen.getByTestId('map-canvas-legend-kind-summit')).toHaveTextContent('主峰');
    expect(screen.getByTestId('map-canvas-legend-kind-route')).toHaveTextContent('普通地点');
  });

  it('showUnknown=false 时隐藏「未发现」', () => {
    render(<MapCanvasLegend showUnknown={false} />);
    expect(screen.queryByTestId('map-canvas-legend-state-unknown')).toBeNull();
    expect(screen.getByTestId('map-canvas-legend-state-current')).toBeInTheDocument();
  });

  it('compact（底部提示条用）只留四态，不展示枢纽类型', () => {
    render(<MapCanvasLegend compact />);
    expect(screen.getByTestId('map-canvas-legend-state-known')).toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas-legend-kind-waypoint')).toBeNull();
  });

  it('不出现协议值原文（kind / state 英文名不上屏）', () => {
    render(<MapCanvasLegend />);
    const text = document.body.textContent ?? '';
    for (const raw of ['secret_realm', 'waypoint', 'current', 'visited', 'known', 'unknown']) {
      expect(text).not.toContain(raw);
    }
  });
});
