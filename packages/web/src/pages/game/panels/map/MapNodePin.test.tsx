/**
 * `MapNodePin` 视觉规格 v2（`19-...任务书.md` §4/§5）：
 * - **形状即层级**：门=圆角方 / 峰=圆 / 院=六边形 / 主峰=八角星（`data-shape` 暴露）；
 * - **名字写在形状下方**（旧口径「图上不写名字」作废，见组件注释）；
 * - 可交互 / 不可交互**只靠饱和度区分**，不可交互**不是虚线**；
 * - 热区 ≥44px、当前所在 ×1.15 + 金色光晕；
 * - 颜色只用 antd token：为了能区分 `colorInfo`（门）与 `colorPrimary`（峰），
 *   这里用 `ThemeProvider` 注入一个与 `colorInfo` 不同的主色，再取同一份 token 比对。
 */
import { render, screen } from '@testing-library/react';
import { theme } from 'antd';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import { ThemeProvider } from '@idle-path/ui-kit';
import { MARKER_PX, MapNodePin } from './MapNodePin.js';
import { RING_VISUAL_PX } from './pin-shapes.js';

/** 与 `colorInfo` 不同，才能证明「门用 info、峰用 primary」这条映射真的生效。 */
const PRIMARY = '#0f766e';

const token = theme.getDesignToken({ token: { colorPrimary: PRIMARY } });

/** jsdom 会把 `rgba(0,0,0,0.88)` 规范化成 `rgba(0, 0, 0, 0.88)`，比较前统一去空白。 */
function sameColor(actual: string | undefined, expected: string): boolean {
  return (actual ?? '').replace(/\s+/g, '') === expected.replace(/\s+/g, '');
}

function node(overrides: Partial<MapNodeView> = {}): MapNodeView {
  const progress: NodeProgressView = {
    visited: false,
    waypointUnlocked: false,
    idleUnlocked: false,
    cleared: false,
  };
  return {
    id: 1,
    code: 'qy_cangshuge',
    name: '藏书阁',
    ring: 'inner',
    sector: null,
    kind: 'route',
    featureKey: 'skill',
    level: 4,
    threshold: 75,
    hasWaypoint: false,
    chapter: 2,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 17,
    gridRow: 8,
    gridCol: 12,
    description: '九层木阁。',
    adjacent: false,
    progress,
    ...overrides,
  };
}

/** 注入与生产一致的主题上下文（只换主色，便于断言 token 映射）。 */
function draw(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider mode="light" primaryColor={PRIMARY}>{ui}</ThemeProvider>);
}

function pin(code = 'qy_cangshuge'): HTMLElement {
  return screen.getByTestId(`map-node-pin-${code}`);
}
function shapeEl(code = 'qy_cangshuge'): SVGElement {
  return screen.getByTestId(`map-node-shape-${code}`) as unknown as SVGElement;
}
/** 形状本体 = svg 里最后一个图形节点（前面可能有一个光晕 circle）。 */
function figure(code = 'qy_cangshuge'): SVGElement {
  const children = [...shapeEl(code).children];
  return children[children.length - 1] as SVGElement;
}

describe('MapNodePin · 形状即层级（§4）', () => {
  it('四种环层各自的形状标签与档位', () => {
    draw(
      <>
        <MapNodePin node={node({ code: 'p_outer', ring: 'outer' })} state="known" />
        <MapNodePin node={node({ code: 'p_peaks', ring: 'peaks' })} state="known" />
        <MapNodePin node={node({ code: 'p_inner', ring: 'inner' })} state="known" />
        <MapNodePin node={node({ code: 'p_summit', ring: 'summit' })} state="known" />
      </>,
    );
    expect(pin('p_outer')).toHaveAttribute('data-shape', 'square');
    expect(pin('p_peaks')).toHaveAttribute('data-shape', 'circle');
    expect(pin('p_inner')).toHaveAttribute('data-shape', 'hexagon');
    expect(pin('p_summit')).toHaveAttribute('data-shape', 'star');
    expect(pin('p_outer')).toHaveAttribute('data-tier', 'outer');
    expect(pin('p_summit')).toHaveAttribute('data-tier', 'summit');
  });

  it('形状用内联 svg 画：门=rect / 峰=circle / 院=polygon / 主峰=polygon(16 点)', () => {
    draw(
      <>
        <MapNodePin node={node({ code: 'p_outer', ring: 'outer' })} state="known" />
        <MapNodePin node={node({ code: 'p_peaks', ring: 'peaks' })} state="known" />
        <MapNodePin node={node({ code: 'p_inner', ring: 'inner' })} state="known" />
        <MapNodePin node={node({ code: 'p_summit', ring: 'summit' })} state="known" />
      </>,
    );
    expect(figure('p_outer').tagName.toLowerCase()).toBe('rect');
    expect(figure('p_peaks').tagName.toLowerCase()).toBe('circle');
    expect(figure('p_inner').tagName.toLowerCase()).toBe('polygon');
    expect(figure('p_summit').tagName.toLowerCase()).toBe('polygon');
    expect((figure('p_inner').getAttribute('points') ?? '').trim().split(/\s+/)).toHaveLength(6);
    expect((figure('p_summit').getAttribute('points') ?? '').trim().split(/\s+/)).toHaveLength(16);
  });

  it('未知 / approach 环层兜底：approach → 山门档，未知 → 峰档', () => {
    draw(
      <>
        <MapNodePin node={node({ code: 'p_approach', ring: 'approach' })} state="known" />
        <MapNodePin node={node({ code: 'p_weird', ring: 'weird_ring' })} state="known" />
      </>,
    );
    expect(pin('p_approach')).toHaveAttribute('data-shape', 'square');
    expect(pin('p_weird')).toHaveAttribute('data-shape', 'circle');
  });

  it('视觉直径按环层分档，主峰最大；热区仍是 44', () => {
    draw(
      <>
        <MapNodePin node={node({ code: 'p_outer', ring: 'outer' })} state="known" />
        <MapNodePin node={node({ code: 'p_summit', ring: 'summit' })} state="known" />
      </>,
    );
    expect(parseFloat(shapeEl('p_outer').getAttribute('width') ?? '0')).toBe(RING_VISUAL_PX.outer);
    expect(parseFloat(shapeEl('p_summit').getAttribute('width') ?? '0')).toBe(RING_VISUAL_PX.summit);
    for (const code of ['p_outer', 'p_summit']) {
      expect(parseFloat(pin(code).style.width)).toBeGreaterThanOrEqual(MARKER_PX);
      expect(parseFloat(pin(code).style.height)).toBeGreaterThanOrEqual(MARKER_PX);
    }
  });
});

describe('MapNodePin · 名字写在形状下方（§4 的旧口径更正）', () => {
  it('名字出现在 DOM 里，且不在 svg 内部（形状塞不下 6 个字）', () => {
    const { container } = draw(<MapNodePin node={node()} state="known" />);
    expect(screen.getByTestId('map-node-name-qy_cangshuge')).toHaveTextContent('藏书阁');
    expect(container.textContent).toContain('藏书阁');
    expect(shapeEl().querySelector('text')).toBeNull();
    // 名字在热区盒子下方（top:100%）
    expect(screen.getByTestId('map-node-name-qy_cangshuge').style.top).toBe('100%');
  });

  it('长名字（第八峰·历练）也完整上屏', () => {
    draw(<MapNodePin node={node({ code: 'p_long', name: '第八峰·历练' })} state="known" />);
    expect(screen.getByTestId('map-node-name-p_long')).toHaveTextContent('第八峰·历练');
  });

  it('协议 kind 原文不上屏', () => {
    const { container } = draw(<MapNodePin node={node({ kind: 'weird_kind' })} state="known" />);
    expect(container.textContent).not.toContain('weird_kind');
  });
});

describe('MapNodePin · 可交互靠饱和度，废掉虚线空心（§5）', () => {
  it('可交互：该环层色实线 2.5px + 20% 底色 + 光晕 + 亮名字', () => {
    draw(<MapNodePin node={node({ code: 'p_live', ring: 'inner' })} state="known" />);
    const body = figure('p_live');
    expect(body.getAttribute('stroke')).toBe(token.colorSuccess);
    expect(body.getAttribute('stroke-width')).toBe('2.5');
    expect(body.getAttribute('fill')).toBe(token.colorSuccess);
    expect(body.getAttribute('fill-opacity')).toBe('0.2');
    expect(screen.getByTestId('map-node-halo-p_live')).toBeInTheDocument();
    expect(sameColor(screen.getByTestId('map-node-name-p_live').style.color, token.colorText)).toBe(true);
  });

  it('四环层各自的描边色映射：门=info / 峰=primary / 院=success / 主峰=warning', () => {
    draw(
      <>
        <MapNodePin node={node({ code: 'c_outer', ring: 'outer' })} state="known" />
        <MapNodePin node={node({ code: 'c_peaks', ring: 'peaks' })} state="known" />
        <MapNodePin node={node({ code: 'c_inner', ring: 'inner' })} state="known" />
        <MapNodePin node={node({ code: 'c_summit', ring: 'summit' })} state="known" />
      </>,
    );
    expect(figure('c_outer').getAttribute('stroke')).toBe(token.colorInfo);
    expect(figure('c_peaks').getAttribute('stroke')).toBe(token.colorPrimary);
    expect(figure('c_inner').getAttribute('stroke')).toBe(token.colorSuccess);
    expect(figure('c_summit').getAttribute('stroke')).toBe(token.colorWarning);
    // 门与峰必须是不同的颜色（否则这条映射白写）
    expect(token.colorInfo).not.toBe(token.colorPrimary);
  });

  it('不可交互：去饱和实线 2px + colorFillTertiary 底 + 暗名字，无光晕', () => {
    const { container } = draw(
      <MapNodePin node={node({ code: 'p_locked', ring: 'peaks' })} state="known" disabled />,
    );
    const body = figure('p_locked');
    expect(body.getAttribute('stroke')).toBe(token.colorTextQuaternary);
    expect(body.getAttribute('stroke-width')).toBe('2');
    expect(body.getAttribute('fill')).toBe(token.colorFillTertiary);
    expect(screen.queryByTestId('map-node-halo-p_locked')).toBeNull();
    expect(sameColor(screen.getByTestId('map-node-name-p_locked').style.color, token.colorTextTertiary)).toBe(true);
    // 「虚线空心」是占位符语言，不得用来表达「不可交互」
    expect(body.hasAttribute('stroke-dasharray')).toBe(false);
    expect(container.innerHTML).not.toContain('dashed');
    expect(container.innerHTML).not.toContain('dasharray');
  });

  it('不可交互也**仍然可读**（名字有文本、不是空心到看不见）', () => {
    draw(<MapNodePin node={node({ code: 'p_locked2' })} state="known" disabled />);
    expect(screen.getByTestId('map-node-name-p_locked2')).toHaveTextContent('藏书阁');
    expect(screen.getByTestId('map-node-name-p_locked2').style.color).not.toBe('');
  });
});

describe('MapNodePin · 当前所在（§4：×1.15 + 金色光晕）', () => {
  it('当前节点更大、金色光晕、描边仍是环层色', () => {
    draw(
      <>
        <MapNodePin node={node({ code: 'p_plain', ring: 'inner' })} state="known" />
        <MapNodePin node={node({ code: 'p_current', ring: 'inner' })} state="current" emphasized />
      </>,
    );
    const plain = parseFloat(shapeEl('p_plain').getAttribute('width') ?? '0');
    const current = parseFloat(shapeEl('p_current').getAttribute('width') ?? '0');
    expect(current).toBeGreaterThan(plain);
    expect(current).toBeCloseTo(RING_VISUAL_PX.inner * 1.15, 5);
    expect(screen.getByTestId('map-node-halo-p_current').getAttribute('fill')).toBe(token.colorWarning);
    expect(figure('p_current').getAttribute('stroke')).toBe(token.colorSuccess);
    expect(sameColor(screen.getByTestId('map-node-name-p_current').style.color, token.colorText)).toBe(true);
  });

  it('当前所在且不可交互（自己不是自己的邻居）时**仍高饱和**', () => {
    draw(<MapNodePin node={node({ code: 'p_here', ring: 'peaks' })} state="current" emphasized disabled />);
    expect(figure('p_here').getAttribute('stroke')).toBe(token.colorPrimary);
    expect(figure('p_here').getAttribute('fill-opacity')).toBe('0.2');
    expect(screen.getByTestId('map-node-halo-p_here').getAttribute('fill')).toBe(token.colorWarning);
    expect(sameColor(screen.getByTestId('map-node-name-p_here').style.color, token.colorText)).toBe(true);
  });
});
