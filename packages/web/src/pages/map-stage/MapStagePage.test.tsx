/**
 * `MapStagePage` 单测 —— 断言的是**这一页交付了什么**，而且刻意断言到"画布上真的调了哪些 arc"：
 * 42×42 网格、两条轨道（二环 r9 实线 / 外环 r10 虚线）、13 个点
 * （1 主峰 + 8 八峰错开 22.5° + 4 四门在正方向）、三块读数、以及**滑杆真的能改半径并重画**。
 *
 * 为什么连 arc 都要断言：纯 canvas 在 DevTools 里没有 DOM，页面读数只覆盖"几何与环境"，
 * 而"环到底画没画、点落在哪"只能靠这一类调用次序/坐标断言兜住 —— 否则就要靠人在浏览器里数。
 * jsdom 没有 2D 上下文，这里用最小的假上下文 + 继承 MouseEvent 的 PointerEvent 补上。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStagePage } from './MapStagePage.js';
import {
  COURT_RING_CELLS,
  GATE_RING_CELLS,
  PEAK_RING_CELLS,
  RING_RADIUS_LIMITS,
} from './map-points.js';

/** 可用区域 500×500 ⇒ 每格 floor((500-52)/42) = 10px ⇒ 世界原点 (236,236)。 */
const SIZE = 500;

function domRect(w: number, h: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    width: w,
    height: h,
    toJSON: () => ({}),
  } as DOMRect;
}

/** 记录 arc 与 setLineDash：环/点的位置·半径·线型都在这里被断言。 */
let arcs: string[] = [];
let dashes: number[][] = [];

function fakeContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  return {
    save: noop,
    restore: noop,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    arc: (x: number, y: number, r: number) => arcs.push(`arc(${x},${y},${r})`),
    setLineDash: (segments: number[]) => dashes.push(segments),
    fillText: noop,
    measureText: (text: string) => ({ width: text.length * 6 }),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

/** 滑杆把手（文档顺序 = 外环、二环、内环；中心固定没有滑杆）。 */
const handles = (): Element[] => [...document.querySelectorAll('[role="slider"]')];

/** 容器 500×500 ⇒ 每格 floor((500 − 2×26)/42) = 10px；世界原点 = pad + 半幅×格宽 = 236。 */
const CELL_PX = 10;
const CENTER = 26 + 21 * CELL_PX;

/** 把 arc 调用解析成数字：浮点位置不适合字符串相等，按容差比较。 */
function arcsOf(calls: string[]): { x: number; y: number; r: number }[] {
  return calls
    .map((call) => /^arc\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)$/.exec(call))
    .filter((matched): matched is RegExpExecArray => matched !== null)
    .map((matched) => ({ x: Number(matched[1]), y: Number(matched[2]), r: Number(matched[3]) }));
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

/** 存在一条"以世界原点为圆心、半径 = radiusCells 格"的**环**。 */
function hasRing(calls: string[], radiusCells: number): boolean {
  return arcsOf(calls).some((a) => near(a.x, CENTER) && near(a.y, CENTER) && near(a.r, radiusCells * CELL_PX));
}

/**
 * 存在一个落在世界 `(radiusCells, angleDeg)` 上的**点**（默认直径 1 格 ⇒ 半径 5px）。
 *
 * 期望的屏幕位置在测试里**独立算一遍**（`center + r·cos`、`center − r·sin`）：
 * 这样验的是"页面真的走了世界→屏幕这套变换（含 y 向上）"，而不是把实现抄一遍。
 * 半径从数据表常量取，所以以后调参不会让这几条断言变红。
 */
function hasMark(calls: string[], radiusCells: number, angleDeg = 0, markPx = 5): boolean {
  const rad = (angleDeg * Math.PI) / 180;
  const x = CENTER + radiusCells * Math.cos(rad) * CELL_PX;
  const y = CENTER - radiusCells * Math.sin(rad) * CELL_PX;
  return arcsOf(calls).some((a) => near(a.x, x) && near(a.y, y) && near(a.r, markPx));
}

beforeEach(() => {
  arcs = [];
  dashes = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => fakeContext()) as unknown as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(SIZE, SIZE));
  if (typeof window.PointerEvent === 'undefined') {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MapStagePage', () => {
  it('口径上屏：42 格 / 每轴 43 条线 / 8 等分 / 错开半扇区 / 宗门大阵圈 / 内环预留位 / 滑杆提示', () => {
    render(<MapStagePage />);
    const intro = screen.getByText(/每轴 42 个小格子/);
    expect(intro).toHaveTextContent('每轴 43 条网格线');
    expect(intro).toHaveTextContent('8 等分');
    expect(intro).toHaveTextContent('错开半个扇区');
    expect(intro).toHaveTextContent('宗门大阵圈');
    expect(intro).toHaveTextContent('四正是四院、四隅是');
    expect(intro).toHaveTextContent('暂不渲染');
    expect(intro).toHaveTextContent('滑杆');
  });

  it('按 42 格算出整数格宽与画布尺寸（500×500 ⇒ 每格 10px、画布 472）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid-root').getAttribute('data-cell-px')).toBe('10');
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('472');
  });

  it('⭐ 三条轨道：都以世界原点为心、半径 = 格数 × 格宽；只有外环（宗门大阵圈）是虚线', () => {
    render(<MapStagePage />);
    expect(hasRing(arcs, COURT_RING_CELLS)).toBe(true);
    expect(hasRing(arcs, PEAK_RING_CELLS)).toBe(true);
    expect(hasRing(arcs, GATE_RING_CELLS)).toBe(true);
    // 中心那条 r=0 的"环"不该被画出来
    expect(hasRing(arcs, 0)).toBe(false);
    expect(dashes.filter((segments) => segments.length > 0)).toHaveLength(1);
  });

  it('⭐ 17 个**渲染**点位都画出来（直径 1 格 ⇒ 半径 5px），位置按世界坐标 + y 向上', () => {
    render(<MapStagePage />);
    // 3 条环 + 17 个点
    expect(arcs).toHaveLength(3 + 17);
    expect(hasMark(arcs, 0)).toBe(true); // 主峰
    expect(hasMark(arcs, GATE_RING_CELLS, 0)).toBe(true); // 宗门·东门
    expect(hasMark(arcs, GATE_RING_CELLS, 90)).toBe(true); // 宗门·北门（屏幕 y 更小 ⇒ y 向上）
    expect(hasMark(arcs, GATE_RING_CELLS, 270)).toBe(true); // 宗门·南门
    expect(hasMark(arcs, COURT_RING_CELLS, 0)).toBe(true); // 四院·东
    expect(hasMark(arcs, PEAK_RING_CELLS, 22.5)).toBe(true); // 八峰·一
    expect(hasMark(arcs, PEAK_RING_CELLS, 112.5)).toBe(true); // 八峰·三
  });

  it('⭐ 4 个隐藏位（内环四隅）**一个都不画**，但它们仍在数据与读数里', () => {
    render(<MapStagePage />);
    for (const angle of [45, 135, 225, 315]) {
      expect(hasMark(arcs, COURT_RING_CELLS, angle)).toBe(false);
    }
    expect(hasMark(arcs, COURT_RING_CELLS, 0)).toBe(true); // 四正照画
    expect(screen.getByTestId('stage-hidden-inner_1')).toHaveTextContent('预留·东北');
    expect(screen.queryByTestId('stage-point-inner_1')).toBeNull();
  });

  it('⭐ 滑杆：默认值来自数据表，中心不给滑杆', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('ring-value-gate')).toHaveTextContent(`${GATE_RING_CELLS} 格`);
    expect(screen.getByTestId('ring-value-peak')).toHaveTextContent(`${PEAK_RING_CELLS} 格`);
    expect(screen.getByTestId('ring-value-court')).toHaveTextContent(`${COURT_RING_CELLS} 格`);
    expect(screen.queryByTestId('ring-value-summit')).toBeNull();
    expect(handles()).toHaveLength(3);
  });

  it('⭐ 「复制环半径」按钮在页面上（点一下就把常量写进剪贴板 + 控制台）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('ring-export-button')).toHaveTextContent('复制环半径');
  });

  it('⭐ 拖动滑杆（键盘一步）⇒ 半径、环、点位一起重画，读数同步', () => {
    render(<MapStagePage />);
    // 假上下文是**日志**（只追加），并不模拟"重画会清空画布"——所以只看这一帧新产生的那一段
    const before = arcs.length;
    // 二环把手 = 第 2 个；右方向键走一步（0.5 格）
    fireEvent.keyDown(handles()[1] as Element, { key: 'ArrowRight', keyCode: 39, which: 39 });
    const frame = arcs.slice(before);
    const next = PEAK_RING_CELLS + RING_RADIUS_LIMITS.step;

    expect(hasRing(frame, next)).toBe(true);
    expect(hasRing(frame, PEAK_RING_CELLS)).toBe(false); // 旧半径不再画
    expect(hasMark(frame, next, 22.5)).toBe(true); // 八峰·一 跟着挪
    // 读数报的是当前值，不是默认值
    expect(screen.getByTestId('ring-value-peak')).toHaveTextContent(`${next} 格`);
    expect(screen.getByTestId('stage-rings')).toHaveTextContent(`二环 · 八峰 r${next}（实线）×8`);
  });

  it('⭐ 外环滑杆独立生效（改一个环不影响另一个）', () => {
    render(<MapStagePage />);
    const before = arcs.length;
    fireEvent.keyDown(handles()[0] as Element, { key: 'ArrowLeft', keyCode: 37, which: 37 });
    const frame = arcs.slice(before);
    expect(hasRing(frame, GATE_RING_CELLS - RING_RADIUS_LIMITS.step)).toBe(true);
    expect(hasRing(frame, PEAK_RING_CELLS)).toBe(true); // 二环不动
  });

  it('读数端到端接通（onMetrics 真的把几何交给页面）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('10 px');
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('(236, 236) px');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('472 × 472 CSS');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
    // 环读数用用户口径的名字（相位在下面的说明里）
    expect(screen.getByTestId('stage-rings')).toHaveTextContent(`外环 · 四门 r${GATE_RING_CELLS}（虚线）×4`);
  });

  it('⭐ 17 个点位坐标上屏 + 4 个隐藏位单独一行（可从页面直接核对相位与 8 等分）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-points').children).toHaveLength(17);
    expect(screen.getByTestId('stage-point-summit')).toHaveTextContent('主峰 (0, 0)');
    expect(screen.getByTestId('stage-point-gate_2')).toHaveTextContent(`宗门·北门 (0, ${GATE_RING_CELLS})`);
    expect(screen.getByTestId('stage-point-court_2')).toHaveTextContent(`四院·北 (0, ${COURT_RING_CELLS})`);
    // 八峰的浮点坐标由 map-points 的夹具测试钉死，这里只验"标签 + 数值有两位小数"
    expect(screen.getByTestId('stage-point-peak_1')).toHaveTextContent(/八峰·一 \(-?\d+\.\d, -?\d+\.\d\)/);
    expect(screen.getByTestId('stage-hidden-inner_1')).toHaveTextContent('预留·东北 (');
  });

  it('⭐ 鼠标移到某格 ⇒ 读数报出那一格；移出 ⇒ 回到 —', () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');

    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 60 });
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 07 / 行 03');

    fireEvent.pointerLeave(canvas);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');
  });

  it('窗口太小（容器 0×0）⇒ 读数 —、画布 0×0、一个 arc 都不画，且不抛错', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(0, 0));
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('0');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(arcs).toEqual([]);
  });
});
