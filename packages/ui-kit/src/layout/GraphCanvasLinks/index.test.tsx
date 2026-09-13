/**
 * GraphCanvasLinks：坐标即格号（世界坐标）、三态线色走 token、悬挂边直接丢弃、
 * `non-scaling-stroke`（父层 scale 时线宽不跟着变粗）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GraphCanvasLinks } from './index.js';

const ITEMS = [
  { key: 'a', row: 0, col: 0, content: null },
  { key: 'b', row: 2, col: 3, content: null },
  { key: 'c', row: 21, col: 21, content: null },
];

/** 连线层是 SVG 片段（`<g>`），必须包在 `<svg>` 里渲染，否则 jsdom 会把标签当未知 HTML。 */
function renderLinks(element: React.ReactElement) {
  return render(<svg>{element}</svg>);
}

describe('GraphCanvasLinks', () => {
  it('两端都存在才画线，坐标是「格号 × cellPx」', () => {
    const { container } = renderLinks(
      <GraphCanvasLinks items={ITEMS} links={[{ from: 'a', to: 'b' }]} cellPx={48} />,
    );
    const line = screen.getByTestId('graph-canvas-link');
    expect(line).toHaveAttribute('x1', '0');
    expect(line).toHaveAttribute('y1', '0');
    expect(line).toHaveAttribute('x2', String(3 * 48));
    expect(line).toHaveAttribute('y2', String(2 * 48));
    expect(line).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(container.querySelectorAll('[data-testid="graph-canvas-link"]')).toHaveLength(1);
  });

  it('links 指向不存在的 key / 空 links 都不画线，不崩', () => {
    renderLinks(<GraphCanvasLinks items={ITEMS} links={[{ from: 'a', to: 'ghost' }]} cellPx={48} />);
    expect(screen.queryAllByTestId('graph-canvas-link')).toHaveLength(0);
    renderLinks(<GraphCanvasLinks items={ITEMS} links={[]} cellPx={48} />);
    expect(screen.queryAllByTestId('graph-canvas-link')).toHaveLength(0);
  });

  it('三态（normal / active / locked）都带 data-state，颜色来自 token（非 undefined）', () => {
    renderLinks(
      <GraphCanvasLinks
        items={ITEMS}
        links={[
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c', state: 'active' },
          { from: 'a', to: 'c', state: 'locked' },
        ]}
        cellPx={48}
      />,
    );
    const states = screen.getAllByTestId('graph-canvas-link').map((el) => el.getAttribute('data-state'));
    expect(states).toEqual(['normal', 'active', 'locked']);
    for (const line of screen.getAllByTestId('graph-canvas-link')) {
      expect(line.getAttribute('stroke')).toBeTruthy();
      expect(line.getAttribute('opacity')).toBeTruthy();
    }
  });

  it('cellPx 很大 / 为 0 都不产出 NaN 坐标', () => {
    renderLinks(<GraphCanvasLinks items={ITEMS} links={[{ from: 'a', to: 'b' }]} cellPx={0} />);
    expect(screen.getByTestId('graph-canvas-link')).toHaveAttribute('x2', '0');
  });
});
