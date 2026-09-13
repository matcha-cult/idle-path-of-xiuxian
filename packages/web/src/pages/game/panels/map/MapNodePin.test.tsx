/**
 * `MapNodePin`：**纯圆形图标、图上不写名字**；四态靠 data-state 暴露、等宽高（圆形）、
 * 热区不小于 44px；`kind` 用 glyph 区分；当前节点尺寸更大。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import { ICON_PX, MARKER_PX, MapNodePin } from './MapNodePin.js';

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
    progress,
    ...overrides,
  };
}

/** 内层圆形（视觉本体）：根节点的第一个子元素。 */
function circle(code = 'qy_cangshuge'): HTMLElement {
  const root = screen.getByTestId(`map-node-pin-${code}`);
  return root.firstElementChild as HTMLElement;
}

describe('MapNodePin · 圆形图标与四态', () => {
  it('图上不写名字：没有文本节点', () => {
    const { container } = render(<MapNodePin node={node()} state="known" />);
    expect(container.textContent).toBe('');
    expect(screen.queryByText('藏书阁')).toBeNull();
  });

  it('热区不小于 44px，视觉直径不小于 34px（§14.2）', () => {
    render(<MapNodePin node={node()} state="known" />);
    const root = screen.getByTestId('map-node-pin-qy_cangshuge').style;
    expect(parseFloat(root.width)).toBeGreaterThanOrEqual(MARKER_PX);
    expect(parseFloat(root.height)).toBeGreaterThanOrEqual(MARKER_PX);
    expect(parseFloat(circle().style.width)).toBeGreaterThanOrEqual(ICON_PX);
  });

  it('圆形：宽高相等 + 50% 圆角 + 有描边', () => {
    render(<MapNodePin node={node()} state="visited" />);
    const style = circle().style;
    expect(style.width).toBe(style.height);
    expect(style.borderRadius).toBe('50%');
    expect(style.border).toContain('solid');
  });

  it('四态都暴露 data-state，且描边样式可区分（已知未到达是虚线）', () => {
    for (const state of ['current', 'visited', 'known', 'unknown'] as const) {
      const { unmount } = render(<MapNodePin node={node()} state={state} />);
      expect(screen.getByTestId('map-node-pin-qy_cangshuge')).toHaveAttribute('data-state', state);
      const border = circle().style.border;
      if (state === 'known') expect(border).toContain('dashed');
      else expect(border).toContain('solid');
      unmount();
    }
  });

  it('当前所在节点更大（emphasized 由 state=current 驱动）', () => {
    // 两个节点同时在场，用 code 区分查询（不能按「最后渲染的那个」取，react-testing-library 会叠在同一个 body 里）
    render(
      <>
        <MapNodePin node={node({ code: 'pin_normal' })} state="visited" />
        <MapNodePin node={node({ code: 'pin_current' })} state="current" emphasized />
      </>,
    );
    const normal = parseFloat(circle('pin_normal').style.width);
    const current = parseFloat(circle('pin_current').style.width);
    expect(current).toBeGreaterThan(normal);
    expect(circle('pin_normal').style.boxShadow).toBe('');
    expect(circle('pin_current').style.boxShadow).not.toBe('');
  });

  it('kind 用 glyph 区分：秘境 ⚔ / 主峰 ★ / 普通无 glyph', () => {
    render(
      <>
        <MapNodePin node={node({ code: 'pin_realm', kind: 'secret_realm' })} state="known" />
        <MapNodePin node={node({ code: 'pin_summit', kind: 'summit' })} state="known" />
        <MapNodePin node={node({ code: 'pin_route', kind: 'route' })} state="known" />
      </>,
    );
    expect(circle('pin_realm').textContent).toBe('⚔');
    expect(circle('pin_summit').textContent).toBe('★');
    expect(circle('pin_route').textContent).toBe('');
  });

  it('未知 kind 不回显协议原文（无 glyph）', () => {
    const { container } = render(<MapNodePin node={node({ kind: 'weird_kind' })} state="known" />);
    expect(container.textContent).toBe('');
    expect(container.textContent).not.toContain('weird_kind');
  });
});
