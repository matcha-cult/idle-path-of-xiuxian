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

/** 滑杆把手（文档顺序 = 外环、二环；中心固定没有滑杆）。 */
const handles = (): Element[] => [...document.querySelectorAll('[role="slider"]')];

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

  it('⭐ 三条轨道：内环 r5 ⇒ 50px、二环 r9 ⇒ 90px（实线）；外环 r10 ⇒ 100px（虚线）', () => {
    render(<MapStagePage />);
    expect(arcs).toContain('arc(236,236,50)');
    expect(arcs).toContain('arc(236,236,90)');
    expect(arcs).toContain('arc(236,236,100)');
    expect(arcs).not.toContain('arc(236,236,0)');
    // 只有外环（宗门大阵圈）画虚线
    expect(dashes.filter((segments) => segments.length > 0)).toHaveLength(1);
  });

  it('⭐ 17 个**渲染**点位都画出来（直径 1 格 ⇒ 半径 5px），位置按世界坐标 + y 向上', () => {
    render(<MapStagePage />);
    // 3 条环 + 17 个点 = 20 次 arc
    expect(arcs).toHaveLength(20);
    expect(arcs).toContain('arc(236,236,5)'); // 主峰
    expect(arcs).toContain('arc(336,236,5)'); // 宗门·东门 (10,0)
    expect(arcs).toContain('arc(236,136,5)'); // 宗门·北门 (0,10)
    expect(arcs).toContain('arc(236,336,5)'); // 宗门·南门 (0,-10)
    expect(arcs).toContain('arc(286,236,5)'); // 四院·东 (5,0)
    // 八峰·一 (8.315, 3.444) ⇒ 屏幕 (319.15, 201.56)：相位 22.5°，两个分量都不为零
    expect(arcs.some((call) => /^arc\(319\.14\d+,201\.55\d+,5\)$/.test(call))).toBe(true);
    expect(arcs.some((call) => /^arc\(201\.55\d+,152\.85\d+,5\)$/.test(call))).toBe(true); // 八峰·三
  });

  it('⭐ 4 个隐藏位（内环四隅）**一个都不画**，但它们仍在数据与读数里', () => {
    render(<MapStagePage />);
    // 预留·东北 = 5 格 @45° ⇒ 屏幕 (236+35.36, 236−35.36) = (271.36, 200.64)
    expect(arcs.some((call) => /^arc\(271\.3\d+,200\.6\d+,5\)$/.test(call))).toBe(false);
    expect(arcs.some((call) => /^arc\(200\.6\d+,271\.3\d+,5\)$/.test(call))).toBe(false); // 预留·东南
    expect(screen.getByTestId('stage-hidden-inner_1')).toHaveTextContent('预留·东北');
    expect(screen.queryByTestId('stage-point-inner_1')).toBeNull();
  });

  it('⭐ 滑杆：默认值来自数据表（外环 10 / 二环 9 / 内环 5），中心不给滑杆', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('ring-value-gate')).toHaveTextContent('10 格');
    expect(screen.getByTestId('ring-value-peak')).toHaveTextContent('9 格');
    expect(screen.getByTestId('ring-value-court')).toHaveTextContent('5 格');
    expect(screen.queryByTestId('ring-value-summit')).toBeNull();
    expect(handles()).toHaveLength(3);
  });

  it('⭐ 拖动滑杆（键盘一步）⇒ 半径、环、点位一起重画，读数同步', () => {
    render(<MapStagePage />);
    // 假上下文是**日志**（只追加），并不模拟"重画会清空画布"——所以只看这一帧新产生的那一段
    const before = arcs.length;
    // 二环把手 = 第 2 个；右方向键走一步（0.5 格）⇒ r = 9.5 ⇒ 95px
    fireEvent.keyDown(handles()[1] as Element, { key: 'ArrowRight', keyCode: 39, which: 39 });
    const frame = arcs.slice(before);

    expect(frame).toContain('arc(236,236,95)');
    expect(frame).not.toContain('arc(236,236,90)');
    // 八峰·一 也跟着挪到 r=9.5、22.5° ⇒ 屏幕 (323.77, 199.65)
    expect(frame.some((call) => /^arc\(323\.7\d+,199\.6\d+,5\)$/.test(call))).toBe(true);
    // 读数报的是当前值，不是默认值
    expect(screen.getByTestId('ring-value-peak')).toHaveTextContent('9.5 格');
    expect(screen.getByTestId('stage-rings')).toHaveTextContent('二环 · 八峰 r9.5（实线）×8');
  });

  it('⭐ 外环滑杆独立生效（改一个环不影响另一个）', () => {
    render(<MapStagePage />);
    fireEvent.keyDown(handles()[0] as Element, { key: 'ArrowLeft', keyCode: 37, which: 37 });
    expect(arcs).toContain('arc(236,236,95)'); // 外环 10 → 9.5
    expect(arcs).toContain('arc(236,236,90)'); // 二环不动
  });

  it('读数端到端接通（onMetrics 真的把几何交给页面）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('10 px');
    expect(screen.getByTestId('stage-origin')).toHaveTextContent('(236, 236) px');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('472 × 472 CSS');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
    // 环读数用用户口径的名字（相位在下面的说明里）
    expect(screen.getByTestId('stage-rings')).toHaveTextContent('外环 · 四门 r10（虚线）×4');
  });

  it('⭐ 17 个点位坐标上屏 + 4 个隐藏位单独一行（可从页面直接核对相位与 8 等分）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-points').children).toHaveLength(17);
    expect(screen.getByTestId('stage-point-summit')).toHaveTextContent('主峰 (0, 0)');
    expect(screen.getByTestId('stage-point-gate_2')).toHaveTextContent('宗门·北门 (0, 10)');
    expect(screen.getByTestId('stage-point-peak_1')).toHaveTextContent('八峰·一 (8.3, 3.4)');
    expect(screen.getByTestId('stage-point-court_2')).toHaveTextContent('四院·北 (0, 5)');
    expect(screen.getByTestId('stage-hidden-inner_1')).toHaveTextContent('预留·东北 (3.5, 3.5)');
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
