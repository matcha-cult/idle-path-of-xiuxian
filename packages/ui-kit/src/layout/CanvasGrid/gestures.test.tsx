/**
 * 手势层单测 —— 缩放/平移是这一版重写的**起因**，它的验收标准是"手感"，而手感在 jsdom 里
 * 摸不到，只能钉住它的**可观测后果**：
 *
 * - 滚轮：锚点下的内容点不动（这才是"缩放跟着鼠标"）；一梭子滚轮只汇报**一次**位姿
 *   （汇报 = React 渲染 ⇒ 这等价于"手势期间 0 次提交"）；
 * - 到达缩放上下限 ⇒ **不** `preventDefault`，把滚轮还给页面（否则画布变成滚轮黑洞）；
 * - 拖动：小于 4px 的手抖既不平移也不算拖动；松手有惯性，停稳后汇报一次；
 * - 位姿不只影响画面：**命中测试也要跟着位姿走**（拿屏幕坐标当初内容坐标是最经典的错）。
 *
 * 容器 400×400 + 4×4 格 ⇒ 每格 87px、内容恰好 400×400：整图适配时"无处可拖"，必须先放大。
 * 滚轮相关的用例用假时钟（省掉 300ms 真实等待），拖动相关的用真时钟（rAF 惯性要真跑）。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasGrid } from './index.js';
import { GRID_PAD_PX, cellAtPoint, fitCellPx } from './geometry.js';
import type { GridLayout } from './geometry.js';
import { MAX_SCALE, MIN_SCALE, toContent, toScreen } from './pose.js';
import type { Pose } from './pose.js';
import type { CanvasGridProps } from './types.js';
import { WHEEL_SETTLE_MS } from './use-view-pose.js';
import { worldToScreen } from './world.js';

const SIZE = 400;
const ROWS = 4;
const COLS = 4;
const CENTER = SIZE / 2;
const LAYOUT: GridLayout = {
  rows: ROWS,
  cols: COLS,
  cellPx: fitCellPx({ availW: SIZE, availH: SIZE, rows: ROWS, cols: COLS, pad: GRID_PAD_PX }),
  pad: GRID_PAD_PX,
};
/** 世界 (1,1) 在**内容坐标**里的位置（与组件内的 `worldToScreen` 同一口径）。 */
const MARK_CONTENT = worldToScreen({ x: 1, y: 1 }, { x: CENTER, y: CENTER }, LAYOUT.cellPx);
const MARKS = [{ key: 'm', at: { x: 1, y: 1 }, radiusCells: 0.1 }];

function domRect(w: number, h: number): DOMRect {
  return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) } as DOMRect;
}

beforeEach(() => {
  // jsdom 没有 2D 上下文，也没有 PointerEvent：补最小的假实现（引入原生 canvas 太重）
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    ({
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      setLineDash: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
    }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => domRect(SIZE, SIZE));
  if (typeof window.PointerEvent === 'undefined') {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const lastPose = (spy: ReturnType<typeof vi.fn>): Pose => spy.mock.calls.at(-1)?.[0] as Pose;

/** 滚轮事件必须**手动派发**：React 的 `onWheel` 在根上是 passive 的，组件自己挂的是非 passive。 */
function wheel(canvas: HTMLElement, deltaY: number, x = CENTER, y = CENTER): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, bubbles: true, cancelable: true });
  act(() => {
    canvas.dispatchEvent(event);
  });
  return event;
}

/** 滚轮是连续事件，等它"停手"（300ms）才把位姿汇报给 React。 */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(WHEEL_SETTLE_MS);
  });
}

/** 真时钟下的等待（rAF 惯性要真跑几帧）。 */
async function flush(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function setup(extra: Partial<CanvasGridProps> = {}): { canvas: HTMLElement; onPose: ReturnType<typeof vi.fn> } {
  const onPose = vi.fn();
  render(<CanvasGrid rows={ROWS} cols={COLS} marks={MARKS} onPose={onPose} {...extra} />);
  onPose.mockClear(); // 挂载时量出尺寸会汇报一次"整图适配"，从这里开始数
  return { canvas: screen.getByTestId('canvas-grid'), onPose };
}

/** 滚 N 格滚轮（**不**汇报位姿：汇报要等 `settle` / `flush`）。 */
function zoomSteps(canvas: HTMLElement, steps = 3): void {
  for (let i = 0; i < steps; i += 1) wheel(canvas, -100);
}

/** 取出"刚放大完"的那次汇报，并断言确实放大了（清空 spy 以便后续断言次数）。 */
function takeZoom(onPose: ReturnType<typeof vi.fn>): Pose {
  expect(onPose).toHaveBeenCalledTimes(1);
  const pose = lastPose(onPose);
  expect(pose.scale).toBeGreaterThan(1);
  onPose.mockClear();
  return pose;
}

describe('滚轮缩放', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('⭐ 一梭子滚轮只汇报一次位姿（每滚一格就渲染一次是最贵的那种实现）', () => {
    const { canvas, onPose } = setup();
    for (let i = 0; i < 8; i += 1) wheel(canvas, -50);
    expect(onPose).not.toHaveBeenCalled();
    settle();
    expect(onPose).toHaveBeenCalledTimes(1);
  });

  it('⭐ 锚点下的内容点不动（缩放跟着鼠标，而不是跟着画布中心）', () => {
    const { canvas, onPose } = setup();
    const anchor = { x: 120, y: 300 };
    const before = toContent(anchor.x, anchor.y, { scale: 1, offsetX: 0, offsetY: 0 });

    for (let i = 0; i < 3; i += 1) wheel(canvas, -100, anchor.x, anchor.y);
    settle();

    const after = toContent(anchor.x, anchor.y, lastPose(onPose));
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('向下滚 = 缩小，且缩不到 MIN_SCALE 以下', () => {
    const { canvas, onPose } = setup();
    for (let i = 0; i < 20; i += 1) wheel(canvas, 100);
    settle();
    expect(lastPose(onPose).scale).toBe(MIN_SCALE);
  });

  it('⭐ 到缩放上下限就把滚轮还给页面（不 preventDefault，否则画布变成"滚轮黑洞"）', () => {
    const { canvas, onPose } = setup();
    let event = wheel(canvas, -100);
    for (let i = 0; i < 30; i += 1) event = wheel(canvas, -100);
    settle();
    expect(lastPose(onPose).scale).toBe(MAX_SCALE);
    expect(event.defaultPrevented).toBe(false); // 已经顶在上限 ⇒ 不吃事件
    expect(wheel(canvas, 100).defaultPrevented).toBe(true); // 反向还缩得动 ⇒ 必须吃掉
  });
});

describe('拖动平移', () => {
  it('⭐ 整图适配时拖动无处可去（内容 = 视口 ⇒ 夹在居中），放大后才拖得动', async () => {
    const { canvas, onPose } = setup();
    fireEvent.pointerDown(canvas, { clientX: CENTER, clientY: CENTER });
    fireEvent.pointerMove(canvas, { clientX: CENTER + 60, clientY: CENTER });
    fireEvent.pointerUp(canvas, { clientX: CENTER + 60, clientY: CENTER });
    await flush(100); // 惯性帧跑完才会汇报
    expect(lastPose(onPose).offsetX).toBe(0);

    onPose.mockClear();
    zoomSteps(canvas, 3);
    await flush(350); // 等滚轮的 300ms "停手"汇报
    const zoomed = takeZoom(onPose);
    fireEvent.pointerDown(canvas, { clientX: CENTER, clientY: CENTER });
    fireEvent.pointerMove(canvas, { clientX: CENTER + 59, clientY: CENTER });
    await flush(200);
    // 最后 1px 慢慢挪 ⇒ 速度低于惯性阈值，松手后位姿不再自己跑（值才能精确断言）
    fireEvent.pointerMove(canvas, { clientX: CENTER + 60, clientY: CENTER });
    await flush(200);
    fireEvent.pointerUp(canvas, { clientX: CENTER + 60, clientY: CENTER });
    expect(lastPose(onPose).offsetX).toBeCloseTo(zoomed.offsetX + 60, 6);
    expect(lastPose(onPose).scale).toBe(zoomed.scale);
  });

  it('手抖（≤4px）既不平移也不算拖动：一次汇报都没有', async () => {
    const { canvas, onPose } = setup();
    zoomSteps(canvas, 3);
    await flush(350);
    takeZoom(onPose);
    fireEvent.pointerDown(canvas, { clientX: CENTER, clientY: CENTER });
    fireEvent.pointerMove(canvas, { clientX: CENTER + 3, clientY: CENTER + 3 });
    fireEvent.pointerUp(canvas, { clientX: CENTER + 3, clientY: CENTER + 3 });
    await flush(100);
    expect(onPose).not.toHaveBeenCalled();
  });

  it('⭐ 松手有惯性：位姿继续往前，停稳后只汇报一次', async () => {
    const { canvas, onPose } = setup();
    zoomSteps(canvas, 3);
    await flush(350);
    const zoomed = takeZoom(onPose);
    fireEvent.pointerDown(canvas, { clientX: CENTER, clientY: CENTER });
    fireEvent.pointerMove(canvas, { clientX: CENTER + 80, clientY: CENTER });
    fireEvent.pointerUp(canvas, { clientX: CENTER + 80, clientY: CENTER });
    expect(onPose).not.toHaveBeenCalled(); // 惯性还在跑 ⇒ 先不汇报（汇报 = 渲染）
    await flush(300);
    expect(onPose).toHaveBeenCalledTimes(1);
    const pose = lastPose(onPose);
    expect(pose.offsetX).toBeGreaterThan(zoomed.offsetX + 80);
    expect(pose.scale).toBe(zoomed.scale);
  });
});

describe('复位与位姿下的命中测试', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('⭐ 复位不会自激：`onPose` 引发父组件重渲染时，一个 resetToken 只消费一次', async () => {
    vi.useRealTimers(); // 这条要真跑几帧（父组件重渲染 + 效果重跑）
    let renders = 0;
    function Pager() {
      const [pose, setPose] = useState<Pose | null>(null);
      const [token, setToken] = useState(0);
      renders += 1;
      return (
        <>
          <button type="button" onClick={() => setToken((value) => value + 1)}>
            reset
          </button>
          <CanvasGrid rows={ROWS} cols={COLS} onPose={setPose} resetToken={token} />
          <span data-testid="zoom">{pose === null ? '—' : `${Math.round(pose.scale * 100)}%`}</span>
        </>
      );
    }
    render(<Pager />);
    await flush(50);
    const before = renders;
    fireEvent.click(screen.getByText('reset'));
    await flush(50);
    // 自激的成因：`useViewPose` 每次渲染返回新对象 ⇒ 复位 effect 每次渲染都跑 ⇒ `reset()` 又
    // `report()`（父组件 setState）⇒ 无限渲染（React 会报 Maximum update depth exceeded）。
    // 正常情况只多渲染一两次。
    expect(renders - before).toBeLessThan(5);
    expect(screen.getByTestId('zoom')).toHaveTextContent('100%');
  });

  it('⭐ resetToken 自增 ⇒ 位姿回到整图适配（位姿不在 state 里，所以用令牌这种命令式逃生口）', () => {
    const onPose = vi.fn();
    const { rerender } = render(<CanvasGrid rows={ROWS} cols={COLS} onPose={onPose} resetToken={0} />);
    const canvas = screen.getByTestId('canvas-grid');
    for (let i = 0; i < 3; i += 1) wheel(canvas, -100);
    settle();
    expect(lastPose(onPose).scale).toBeGreaterThan(1);

    rerender(<CanvasGrid rows={ROWS} cols={COLS} onPose={onPose} resetToken={1} />);
    expect(lastPose(onPose)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('⭐ 缩放后命中测试跟着位姿走（不是拿屏幕坐标当内容坐标）', () => {
    const onHoverCell = vi.fn();
    const onHoverMark = vi.fn();
    const { canvas, onPose } = setup({ onHoverCell, onHoverMark });
    const probe = { x: 100, y: 100 };
    // 适配态：屏幕点 = 内容点 ⇒ 落在 (0,0) 格
    fireEvent.pointerMove(canvas, { clientX: probe.x, clientY: probe.y });
    expect(onHoverCell).toHaveBeenLastCalledWith({ col: 0, row: 0 });

    for (let i = 0; i < 3; i += 1) wheel(canvas, -100); // 以画布中心为锚放大
    settle();
    const pose = lastPose(onPose);

    // 同一个屏幕点，在放大后的位姿下落在**另一个**格子 —— 该是哪格由几何算出来，不写死数字
    const content = toContent(probe.x, probe.y, pose);
    const expected = cellAtPoint(content.x, content.y, LAYOUT);
    expect(expected).not.toEqual({ col: 0, row: 0 });
    fireEvent.pointerMove(canvas, { clientX: probe.x, clientY: probe.y });
    expect(onHoverCell).toHaveBeenLastCalledWith(expected);

    // 功能点同理：位置要按位姿算才对得上；拿适配态的位置点它应该点不到
    const target = toScreen(MARK_CONTENT.x, MARK_CONTENT.y, pose);
    onHoverMark.mockClear();
    fireEvent.pointerMove(canvas, { clientX: MARK_CONTENT.x, clientY: MARK_CONTENT.y });
    expect(onHoverMark).not.toHaveBeenCalled();
    fireEvent.pointerMove(canvas, { clientX: target.x, clientY: target.y });
    expect(onHoverMark).toHaveBeenLastCalledWith('m');
  });
});
