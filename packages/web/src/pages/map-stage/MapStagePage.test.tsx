/**
 * `MapStagePage` 单测 —— 断言的是**这一页交付了什么**，而且刻意断言到"画布上真的调了哪些 arc"：
 * 42×42 网格、两条轨道（二环 r9 实线 / 外环 r10 虚线）、13 个点
 * （1 主峰 + 8 八峰错开 22.5° + 4 四门在正方向）、三块读数、以及**滑杆真的能改半径并重画**。
 *
 * 为什么连 arc 都要断言：纯 canvas 在 DevTools 里没有 DOM，页面读数只覆盖"几何与环境"，
 * 而"环到底画没画、点落在哪"只能靠这一类调用次序/坐标断言兜住 —— 否则就要靠人在浏览器里数。
 * jsdom 没有 2D 上下文，这里用最小的假上下文 + 继承 MouseEvent 的 PointerEvent 补上。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStagePage } from './MapStagePage.js';
import { MAP_OBJECTS } from './map-objects.js';
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

/** 记录 arc / setLineDash / 线段 / stroke 次数：环、点、连接线都在这里被断言。 */
let arcs: string[] = [];
let dashes: number[][] = [];
let segments: string[] = [];
let strokeCount = 0;
/** 每帧起点（`clearRect` 处）的记录：挂载时尺寸未知的那一帧什么都不画，量出后才真画。 */
let frames: { arcs: number; dashes: number; segments: number; strokes: number }[] = [];

/**
 * 最后一帧的全部调用（从最后一次清屏算起）。
 *
 * 为什么必须按帧看：画布**铺满视口**、内容在视口里居中，挂载时会经历"尺寸未知（0×0）→ 量出"
 * 两次绘制，而假上下文是**只追加的日志**（它不模拟"重画会清空画布"）。全量计数会把两帧加在一起，
 * 于是"37 次 stroke"会变成 74 —— 那是断言写错了，不是页面画错了。
 */
function lastFrame(): { arcs: string[]; dashes: number[][]; segments: string[]; strokes: number } {
  const mark = frames.at(-1) ?? { arcs: 0, dashes: 0, segments: 0, strokes: 0 };
  return {
    arcs: arcs.slice(mark.arcs),
    dashes: dashes.slice(mark.dashes),
    segments: segments.slice(mark.segments),
    strokes: strokeCount - mark.strokes,
  };
}

function fakeContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  return {
    save: noop,
    restore: noop,
    setTransform: noop,
    clearRect: () => {
      frames.push({ arcs: arcs.length, dashes: dashes.length, segments: segments.length, strokes: strokeCount });
    },
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: (x: number, y: number) => segments.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => segments.push(`lineTo(${x},${y})`),
    stroke: () => {
      strokeCount += 1;
    },
    fill: noop,
    arc: (x: number, y: number, r: number) => arcs.push(`arc(${x},${y},${r})`),
    setLineDash: (segments2: number[]) => dashes.push(segments2),
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

/**
 * 整图适配把内容**居中**：画布铺满视口 500，而内容只有 472（42×10 + 两侧 pad）⇒ 屏幕 = 内容 + 14。
 * 指针事件的坐标是**屏幕**坐标，绘制调用的坐标是**内容**坐标 —— 这两者不再相等，别再混用。
 */
const FIT = SIZE / 2 - CENTER;
const screenOf = (content: number): number => content + FIT;

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
  segments = [];
  strokeCount = 0;
  frames = [];
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
    expect(intro).toHaveTextContent('连线（灰）按**规则**生成');
    expect(intro).toHaveTextContent('滑杆');
  });

  it('⭐ 连接线：主峰—四院·东 这条边真的画出来了（两端落在世界坐标上）', () => {
    render(<MapStagePage />);
    // 主峰 = 世界原点 ⇒ 屏幕 (236,236)；四院·东 = 世界 (COURT_RING_CELLS, 0) ⇒ 屏幕 (236+80, 236)
    const eastCourtX = CENTER + COURT_RING_CELLS * CELL_PX;
    expect(segments).toContain(`moveTo(${CENTER},${CENTER})`);
    expect(segments).toContain(`lineTo(${eastCourtX},${CENTER})`);
  });

  it('⭐ 笔数对得上：2（细线/主线）+ 3（三条环）+ 32（连接线）= 37 次 stroke', () => {
    render(<MapStagePage />);
    // 32 条边的条数由 map-links 的拓扑测试钉死；这里验"页面真的把它们都画了"
    expect(lastFrame().strokes).toBe(2 + 3 + 32);
  });

  it('⭐ 隐藏位没有连线（不会出现"连着看不见的点"的线）', () => {
    render(<MapStagePage />);
    const rad = Math.PI / 4;
    const hidden = {
      x: CENTER + COURT_RING_CELLS * Math.cos(rad) * CELL_PX,
      y: CENTER - COURT_RING_CELLS * Math.sin(rad) * CELL_PX,
    };
    const endsAtHidden = segments.some((call) => {
      const matched = /^(?:moveTo|lineTo)\((-?[\d.]+),(-?[\d.]+)\)$/.exec(call);
      return matched !== null && near(Number(matched[1]), hidden.x) && near(Number(matched[2]), hidden.y);
    });
    expect(endsAtHidden).toBe(false);
    // 而四院·东（可见）确实在线上
    expect(segments).toContain(`lineTo(${CENTER + COURT_RING_CELLS * CELL_PX},${CENTER})`);
  });

  it('⭐ 悬停到点 ⇒ 读数报出它的名字；移到空白 ⇒ 回到 —', () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');
    const eastCourtX = CENTER + COURT_RING_CELLS * CELL_PX;

    fireEvent.pointerMove(canvas, { clientX: screenOf(eastCourtX), clientY: screenOf(CENTER) });
    expect(screen.getByTestId('stage-hover-mark')).toHaveTextContent('四院·东 [court_1]');

    fireEvent.pointerMove(canvas, { clientX: screenOf(CENTER + 5), clientY: screenOf(CENTER + 150) });
    expect(screen.getByTestId('stage-hover-mark')).toHaveTextContent('—');
  });

  it('⭐ 点一下点 ⇒ 选中（画布出现常驻聚焦圈）；点空白 ⇒ 取消选中', () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');
    const eastCourtX = CENTER + COURT_RING_CELLS * CELL_PX;

    const before = arcs.length;
    fireEvent.pointerDown(canvas, { clientX: screenOf(eastCourtX), clientY: screenOf(CENTER) });
    fireEvent.pointerUp(canvas, { clientX: screenOf(eastCourtX), clientY: screenOf(CENTER) });
    expect(screen.getByTestId('stage-selected-mark')).toHaveTextContent('四院·东 [court_1]');
    // 点半径 5px ⇒ 选中圈 5 + 3 + 1 = 9
    expect(arcs.slice(before)).toContain(`arc(${eastCourtX},${CENTER},9)`);

    // 点空白 ⇒ 取消选中（这是"点空白取消"的唯一入口）
    fireEvent.pointerDown(canvas, { clientX: screenOf(CENTER + 5), clientY: screenOf(CENTER + 150) });
    fireEvent.pointerUp(canvas, { clientX: screenOf(CENTER + 5), clientY: screenOf(CENTER + 150) });
    expect(screen.getByTestId('stage-selected-mark')).toHaveTextContent('—');
  });

  it('⭐ 拖动（位移超过阈值）不会选中任何点 —— 点击与拖动不串', () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');
    const eastCourtX = CENTER + COURT_RING_CELLS * CELL_PX;
    fireEvent.pointerDown(canvas, { clientX: screenOf(eastCourtX), clientY: screenOf(CENTER) });
    fireEvent.pointerUp(canvas, { clientX: screenOf(eastCourtX + 30), clientY: screenOf(CENTER + 30) });
    expect(screen.getByTestId('stage-selected-mark')).toHaveTextContent('—');
  });

  it('按 42 格算出整数格宽；画布铺满**视口**（500），格阵内容 472 居中', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid-root').getAttribute('data-cell-px')).toBe('10');
    // 画布 = 视口（缩放平移的对象是它）；内容 = 42×10 + 两侧 26 = 472，多出来的 28 是"整格取整"的余量
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('500');
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('500 × 500 CSS');
  });

  it('⭐ 三条轨道：都以世界原点为心、半径 = 格数 × 格宽；只有外环（宗门大阵圈）是虚线', () => {
    render(<MapStagePage />);
    expect(hasRing(arcs, COURT_RING_CELLS)).toBe(true);
    expect(hasRing(arcs, PEAK_RING_CELLS)).toBe(true);
    expect(hasRing(arcs, GATE_RING_CELLS)).toBe(true);
    // 中心那条 r=0 的"环"不该被画出来
    expect(hasRing(arcs, 0)).toBe(false);
    expect(lastFrame().dashes.filter((segments) => segments.length > 0)).toHaveLength(1);
  });

  it('⭐ 17 个**渲染**点位都画出来（直径 1 格 ⇒ 半径 5px），位置按世界坐标 + y 向上', () => {
    render(<MapStagePage />);
    // 3 条环 + 17 个点（只看最后一帧）
    expect(lastFrame().arcs).toHaveLength(3 + 17);
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
    expect(screen.getByTestId('stage-canvas')).toHaveTextContent('500 × 500 CSS');
    expect(screen.getByTestId('stage-lines')).toHaveTextContent('43 条');
    // 环读数用用户口径的名字（相位在下面的说明里）
    expect(screen.getByTestId('stage-rings')).toHaveTextContent(`外环 · 四门 r${GATE_RING_CELLS}（虚线）×4`);
    // 对象读数：总数从对象表派生（改表不会让断言变红）
    expect(screen.getByTestId('stage-objects')).toHaveTextContent(`${MAP_OBJECTS.length} 个`);
    expect(screen.getByTestId('stage-objects')).toHaveTextContent('传送点 4');
  });

  it('⭐ 17 个点位坐标上屏 + 4 个隐藏位单独一行（可从页面直接核对相位与 8 等分）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('stage-points').children).toHaveLength(17);
    expect(screen.getByTestId('stage-point-summit')).toHaveTextContent('主峰 (0, 0)');
    expect(screen.getByTestId('stage-point-gate_2')).toHaveTextContent(`宗门·北门 (0, ${GATE_RING_CELLS})`);
    expect(screen.getByTestId('stage-point-court_2')).toHaveTextContent(`四院·北 (0, ${COURT_RING_CELLS})`);
    // 八峰的浮点坐标由 map-points 的夹具测试钉死；这里只验"标签 + 数值格式"。
    // 注意**不能**要求必须有小数点：半径取某些值时四舍五入后正好是整数（如 13 格 ⇒ 12）
    expect(screen.getByTestId('stage-point-peak_1')).toHaveTextContent(/八峰·一 \(-?\d+(\.\d)?, -?\d+(\.\d)?\)/);
    expect(screen.getByTestId('stage-hidden-inner_1')).toHaveTextContent('预留·东北 (');
  });

  it('⭐ 鼠标移到某格 ⇒ 读数报出那一格；移出 ⇒ 回到 —', () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');

    fireEvent.pointerMove(canvas, { clientX: screenOf(100), clientY: screenOf(60) });
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('列 07 / 行 03');

    fireEvent.pointerLeave(canvas);
    expect(screen.getByTestId('stage-hover')).toHaveTextContent('—');
  });

  it('⭐ 视图：滚轮缩放后读数里的「缩放」跟着变，点「重置视图」回到 100%（整图适配）', async () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');
    expect(screen.getByTestId('stage-zoom')).toHaveTextContent('100%');
    expect(screen.getByTestId('stage-view-hint')).toHaveTextContent('滚轮');
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        canvas.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -100, clientX: 250, clientY: 250, bubbles: true, cancelable: true }),
        );
      });
    }
    // 滚轮停手 300ms 才汇报位姿 —— 用真时钟等（假时钟在 antd 页面上会卡住动画计时器）
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(screen.getByTestId('stage-zoom')).not.toHaveTextContent('100%');

    fireEvent.click(screen.getByTestId('stage-reset-view'));
    expect(screen.getByTestId('stage-zoom')).toHaveTextContent('100%');
  });

  it('窗口太小（容器 0×0）⇒ 读数 —、画布 0×0、一个 arc 都不画，且不抛错', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(0, 0));
    render(<MapStagePage />);
    expect(screen.getByTestId('canvas-grid').getAttribute('data-canvas-w')).toBe('0');
    expect(screen.getByTestId('stage-cell')).toHaveTextContent('—');
    expect(arcs).toEqual([]);
  });
});

describe('右侧「地图内可交互对象」面板', () => {
  /** 世界坐标 → 屏幕：整图适配把内容居中，所以屏幕 = 内容 + (SIZE/2 − CENTER)。 */
  const at = (contentX: number, contentY: number) => ({ clientX: screenOf(contentX), clientY: screenOf(contentY) });
  const NORTH_GATE = { x: CENTER, y: CENTER - GATE_RING_CELLS * CELL_PX };

  it('⭐ 默认加载全部对象（进地图就能看到有什么可交互）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('object-panel-count')).toHaveTextContent(`${MAP_OBJECTS.length} 个`);
    expect(screen.getByTestId('object-qy_gate_n')).toHaveTextContent('在 宗门·北门');
    expect(screen.getByTestId('object-qy_peak_xunlian')).toHaveTextContent('秘境入口');
  });

  it('⭐ 双向联动：点画布上的点 ⇒ 面板只剩它的对象；点对象名 ⇒ 画布选中该点位', () => {
    render(<MapStagePage />);
    const canvas = screen.getByTestId('canvas-grid');

    fireEvent.pointerDown(canvas, at(NORTH_GATE.x, NORTH_GATE.y));
    fireEvent.pointerUp(canvas, at(NORTH_GATE.x, NORTH_GATE.y));
    expect(screen.getByTestId('object-panel-selected')).toHaveTextContent('宗门·北门');
    expect(screen.queryByTestId('object-qy_peak_xunlian')).toBeNull(); // 别的点位对象不混进来

    // 点「取消选择」⇒ 回到全部
    fireEvent.click(screen.getByTestId('object-panel-clear'));
    expect(screen.getByTestId('object-panel-hint')).toBeTruthy();

    // 反向：点秘境入口的名字 ⇒ 画布选中第八峰·后山
    fireEvent.click(screen.getByTestId('object-goto-qy_peak_xunlian'));
    expect(screen.getByTestId('stage-selected-mark')).toHaveTextContent('八峰·八 [peak_8]');
    expect(screen.getByTestId('object-panel-selected')).toHaveTextContent('八峰·八');
  });

  it('⭐ 门槛：未与传送点交互 ⇒ 传送禁用；交互后解锁并真的能"传送"（前端门控）', () => {
    render(<MapStagePage />);
    expect(screen.getByTestId('object-travel-qy_gate_n')).toBeDisabled();
    expect(screen.getByTestId('object-locked-qy_gate_n')).toHaveTextContent('须先与传送点交互');

    fireEvent.click(screen.getByTestId('object-interact-qy_gate_n'));
    expect(screen.getByTestId('object-done-qy_gate_n')).toHaveTextContent('已交互');
    expect(screen.getByTestId('object-panel-notice')).toHaveTextContent('传送已解锁');
    expect(screen.getByTestId('object-travel-qy_gate_n')).toBeEnabled();

    fireEvent.click(screen.getByTestId('object-travel-qy_gate_n'));
    expect(screen.getByTestId('object-panel-notice')).toHaveTextContent('已传送至「北门」');
    expect(screen.getByTestId('stage-selected-mark')).toHaveTextContent('宗门·北门');
  });

  it('非传送点不提供传送（秘境入口只有交互）', () => {
    render(<MapStagePage />);
    expect(screen.queryByTestId('object-travel-qy_peak_xunlian')).toBeNull();
    expect(screen.queryByTestId('object-locked-qy_peak_xunlian')).toBeNull(); // 没有传送按钮，也就没有"须先交互"这句
  });
});
