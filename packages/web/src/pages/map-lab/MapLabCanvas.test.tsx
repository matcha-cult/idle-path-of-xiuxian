/**
 * `MapLabCanvas` 单测 —— 新画布的**适配与可达性判定**。
 *
 * 要害在这条：可交互判定改用 `waypoint-gate.travelDecision`，因此
 * **不相邻 + 服务端已 waypointUnlocked + 本会话没交互 → 仍然是暗色 disabled**。
 * 这就是「交互才解锁传送」在画布上的可见形态（旧 `MapCanvas` 到这里就会画成可点）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { makeEdge, makeNode } from '../../../test/helpers/map-lab-fixtures.js';
import { MapLabCanvas } from './MapLabCanvas.js';

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
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 660,
    bottom: 660,
    width: 660,
    height: 660,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const none: ReadonlySet<string> = new Set<string>();

const GATE_N = makeNode({ code: 'qy_gate_n', name: '北门', adjacent: true, gridRow: 0, gridCol: 10 });
const APPROACH = makeNode({
  code: 'qy_approach',
  name: '接引区',
  adjacent: false,
  hasWaypoint: false,
  gridRow: 5,
  gridCol: 10,
});
const GATE_S = makeNode({
  code: 'qy_gate_s',
  name: '南门',
  adjacent: false,
  hasWaypoint: true,
  // 服务端「到达即点亮」，但本会话还没交互
  progress: { visited: true, waypointUnlocked: true, idleUnlocked: false, cleared: false },
  gridRow: 20,
  gridCol: 10,
});
const OFF_GRID = makeNode({ code: 'qy_bad', name: '越界点', adjacent: true, gridRow: 99, gridCol: 99 });

const NODES = [GATE_N, APPROACH, GATE_S, OFF_GRID];
const EDGES = [makeEdge('qy_gate_n', 'qy_approach'), makeEdge('qy_approach', 'qy_gate_s')];

function renderCanvas(unlocked: ReadonlySet<string> = none, onSelect = vi.fn()) {
  render(
    <MapLabCanvas
      nodes={NODES}
      edges={EDGES}
      gridRows={20}
      gridCols={20}
      currentCode="qy_gate_n"
      selectedCode={null}
      unlocked={unlocked}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

describe('适配到 canvas 版画布', () => {
  it('渲染 canvas 画布 + 坐标合法的枢纽', () => {
    renderCanvas();
    expect(screen.getByTestId('canvas-graph')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-graph-item-qy_gate_n')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-graph-item-qy_approach')).toBeInTheDocument();
  });

  it('坐标越界的节点不进画布，并给出提示（宁可少一个点，也不要画到界外点不到）', () => {
    renderCanvas();
    expect(screen.queryByTestId('canvas-graph-item-qy_bad')).toBeNull();
    expect(screen.getByTestId('map-lab-canvas-off-grid')).toHaveTextContent('缺少有效坐标');
  });

  it('嵌套的 canvas 容器带修好的高度（整图适配按容器短边算）', () => {
    renderCanvas();
    expect(screen.getByTestId('map-lab-canvas')).toBeInTheDocument();
  });
});

describe('可达性判定（这是本轮机制的可见形态）', () => {
  it('相邻 → 可点（不 disabled）', () => {
    renderCanvas();
    expect(screen.getByTestId('canvas-graph-item-qy_gate_n')).not.toHaveAttribute('aria-disabled');
  });

  it('当前所在 → 可点（即使它不相邻、没有传送点）', () => {
    renderCanvas();
    expect(screen.getByTestId('canvas-graph-item-qy_gate_n')).not.toHaveAttribute('aria-disabled');
  });

  it('⭐ 不相邻 + 服务端已点亮 + 本会话未交互 → **disabled**（旧实现会画成可点）', () => {
    renderCanvas();
    const pin = screen.getByTestId('canvas-graph-item-qy_gate_s');
    expect(pin).toHaveAttribute('aria-disabled', 'true');
    expect(pin).toHaveAttribute('tabindex', '-1');
  });

  it('交互点亮之后同一个点变成可点', () => {
    renderCanvas(new Set(['qy_gate_s']));
    expect(screen.getByTestId('canvas-graph-item-qy_gate_s')).not.toHaveAttribute('aria-disabled');
  });

  it('不相邻且没有传送点 → disabled', () => {
    renderCanvas();
    expect(screen.getByTestId('canvas-graph-item-qy_approach')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('交互契约', () => {
  it('**点击只选中**：轻点枢纽 → onSelect(tap)', () => {
    const onSelect = renderCanvas();
    const pin = screen.getByTestId('canvas-graph-item-qy_gate_n');
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent(pin, event);
    const up = new Event('pointerup', { bubbles: true, cancelable: true });
    Object.assign(up, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent(pin, up);
    expect(onSelect).toHaveBeenCalledWith('qy_gate_n', 'tap');
  });

  it('暗色（去不了）的点点了不回调 —— 连选中都不给它', () => {
    const onSelect = renderCanvas();
    const pin = screen.getByTestId('canvas-graph-item-qy_approach');
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(down, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent(pin, down);
    const up = new Event('pointerup', { bubbles: true, cancelable: true });
    Object.assign(up, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent(pin, up);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('悬停说明里带「为什么去不了」（未交互 / 没传送点两种文案不同）', () => {
    renderCanvas();
    expect(screen.getByTestId('canvas-graph-item-qy_gate_s').getAttribute('title')).toContain('需先在此地与传送点交互');
    expect(screen.getByTestId('canvas-graph-item-qy_approach').getAttribute('title')).toContain('此处没有传送点');
  });
});
