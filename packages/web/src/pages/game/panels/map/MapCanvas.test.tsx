/**
 * `MapCanvas`：把地图数据接到 `GraphCanvas` 上。
 *
 * 断言的是**派生规则**而不是画布内部实现：只画已下发节点、连线端点缺一即丢弃、
 * 越界坐标不进画布、点击只触发 onSelect（不移动）、开发者网格开关透传、图例与新组件仍在场。
 * jsdom 没有真实尺寸，画布用 660×660 打桩（与 ui-kit 的用例同一口径）。
 */
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { MapEdgeView, MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import { MapCanvas } from './MapCanvas.js';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 660, bottom: 660, width: 660, height: 660,
    toJSON: () => ({}),
  } as DOMRect);
});

function progress(overrides: Partial<NodeProgressView> = {}): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false, ...overrides };
}

function node(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return {
    id: 1,
    code: 'n_1',
    name: '节点一',
    ring: 'inner',
    sector: null,
    kind: 'route',
    featureKey: null,
    level: 1,
    threshold: 10,
    hasWaypoint: false,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    gridRow: 5,
    gridCol: 5,
    description: null,
    progress: progress(),
    ...overrides,
  };
}

function edge(fromNodeCode: string, toNodeCode: string): MapEdgeView {
  return { fromNodeCode, toNodeCode, bidirectional: true };
}

const A = node({ id: 1, code: 'a', name: '甲', gridRow: 0, gridCol: 0 });
const B = node({ id: 2, code: 'b', name: '乙', gridRow: 21, gridCol: 21, progress: progress({ visited: true }) });
const C = node({ id: 3, code: 'c', name: '丙', gridRow: 10, gridCol: 10, kind: 'secret_realm' });

function setup(overrides: Partial<Parameters<typeof MapCanvas>[0]> = {}) {
  const onSelect = vi.fn();
  const props = {
    nodes: [A, B, C],
    edges: [edge('a', 'b'), edge('b', 'c')],
    gridRows: 21,
    gridCols: 21,
    currentCode: null,
    selectedCode: null,
    onSelect,
    ...overrides,
  };
  const utils = render(<MapCanvas {...props} />);
  return { ...utils, onSelect, props };
}

describe('MapCanvas · 渲染派生', () => {
  it('每个已下发节点都渲染一个枢纽；名字不上画布', () => {
    setup();
    expect(screen.getByTestId('graph-canvas-item-a')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas-item-b')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas-item-c')).toBeInTheDocument();
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas.textContent).not.toContain('甲');
    expect(canvas.textContent).not.toContain('乙');
  });

  it('连线派生自边：两端都下发才画；悬挂边丢弃', () => {
    setup({ edges: [edge('a', 'b'), edge('a', 'ghost'), edge('ghost', 'b')] });
    expect(screen.getAllByTestId('graph-canvas-link')).toHaveLength(1);
  });

  it('当前节点 / 已到达 / 已知 三态分别落到 data-state', () => {
    setup({ currentCode: 'a' });
    expect(screen.getByTestId('graph-canvas-item-a')).not.toHaveAttribute('data-selected');
    expect(screen.getByTestId('map-node-pin-a')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('map-node-pin-b')).toHaveAttribute('data-state', 'visited');
    expect(screen.getByTestId('map-node-pin-c')).toHaveAttribute('data-state', 'known');
  });

  it('选中节点带 selected（GraphCanvas 会暴露 data-selected=true）', () => {
    setup({ selectedCode: 'c' });
    expect(screen.getByTestId('graph-canvas-item-c')).toHaveAttribute('data-selected', 'true');
  });

  it('与选中/当前相连的边为 active，其余 normal', () => {
    setup({ selectedCode: 'c', edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')] });
    const states = screen.getAllByTestId('graph-canvas-link').map((el) => el.getAttribute('data-state'));
    expect(states.filter((s) => s === 'active')).toHaveLength(2);
    expect(states.filter((s) => s === 'normal')).toHaveLength(1);
  });

  it('越界坐标的节点不进画布，并给出提示（不静默画到界外）', () => {
    setup({ nodes: [A, node({ id: 9, code: 'far', name: '界外', gridRow: 99, gridCol: 0 })], edges: [] });
    expect(screen.queryByTestId('graph-canvas-item-far')).toBeNull();
    expect(screen.getByTestId('map-canvas').textContent).not.toContain('界外');
  });

  it('地图坐标空间非法（0×0）时不画任何枢纽（容器应已降级到列表）', () => {
    setup({ gridRows: 0, gridCols: 0, edges: [] });
    expect(screen.queryByTestId('graph-canvas-item-a')).toBeNull();
  });
});

describe('MapCanvas · 交互与调试开关', () => {
  function pointer(nodeEl: Element, type: string): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
    nodeEl.dispatchEvent(event);
  }

  it('点击枢纽只调 onSelect（不移动、不发请求）', () => {
    const { onSelect } = setup();
    const pin = screen.getByTestId('graph-canvas-item-a');
    pointer(pin, 'pointerdown');
    pointer(pin, 'pointerup');
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('点击空白处触发 onBackgroundClick（取消选中由容器决定）', () => {
    const onBackgroundClick = vi.fn();
    setup({ onBackgroundClick });
    const host = screen.getByTestId('graph-canvas');
    pointer(host, 'pointerdown');
    pointer(host, 'pointerup');
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  });

  it('showGrid 透传：出网格层与每个枢纽的坐标标注', () => {
    setup({ showGrid: true });
    expect(screen.getByTestId('graph-canvas-grid')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas-item-coord-a')).toHaveTextContent('0,0');
    expect(screen.getByTestId('graph-canvas-item-coord-b')).toHaveTextContent('21,21');
    expect(screen.getByTestId('map-canvas-grid-badge')).toBeInTheDocument();
  });

  it('showGrid 缺省不渲染网格与坐标', () => {
    setup();
    expect(screen.queryByTestId('graph-canvas-grid')).toBeNull();
    expect(screen.queryByTestId('graph-canvas-item-coord-a')).toBeNull();
  });

  it('高度可配置（画布高度取 props.height）', () => {
    setup({ height: 320 });
    expect(screen.getByTestId('map-canvas').style.height).toBe('320px');
  });
});
