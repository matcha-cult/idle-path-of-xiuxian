/**
 * `CanvasGraph` **两层对齐不变量**测试（混合渲染的头号风险）。
 *
 * ## 为什么必须有这一条
 * 混合渲染 = **canvas 画连线/点阵** + **DOM 放枢纽**，两层各自算一遍屏幕坐标。只要两套算法
 * 有一点不一致（忘了乘 DPR、`translate` 与 `scale` 顺序反了、`cellPx` 用错），画面上就是
 * **连线端点接不到枢纽** —— 一眼可见，而且 jsdom 测不出来（`getContext('2d')` 返回 null，
 * `paintFrame` 会整条跳过绘制，现有用例只证明了"不崩"）。
 *
 * ## 怎么在没有浏览器的情况下验
 * 不做像素比对，而是**复刻 canvas 的真实仿射矩阵语义**：记录 `setTransform` / `translate` /
 * `scale` 对矩阵的作用，并把绘制时传入的**世界坐标**换算成屏幕 CSS 像素，然后与
 * `paintFrame` 通过 `movePin` 回调报给 DOM 层的枢纽位置**逐一比对**。
 * 这条链路正好覆盖了两层各自的计算路径。
 *
 * 另外三条顺带守住的：绘制参数**不得出现 NaN / 非正线宽**（画不出东西还静默无报错）、
 * 绘制结束后矩阵必须回到「仅 DPR」（否则轴标会被世界变换带偏）、
 * 点阵必须严格落在 `i × cellPx` 的交叉线上。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paintFrame } from './paint-frame.js';
import type { FrameScene } from './paint-frame.js';
import { paletteFromToken } from './palette.js';
import type { CanvasPaletteSource } from './palette.js';
import type { CanvasGraphItem, CanvasGraphLink } from './types.js';

const TOKEN: CanvasPaletteSource = {
  colorBgContainer: 'bg',
  colorBorderSecondary: 'border-2',
  colorBorder: 'border-1',
  colorTextQuaternary: 'text-4',
  colorTextTertiary: 'text-3',
  colorPrimary: 'primary',
};

/** 2×3 仿射矩阵（canvas 约定：`[a c e; b d f]`）。 */
interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface Batch {
  /** 世界坐标下的线段。 */
  segments: { from: [number, number]; to: [number, number] }[];
  width: number;
  alpha: number;
  /** 描边/填充时生效的矩阵（本测试里即当时的世界→设备矩阵）。 */
  matrix: Matrix;
  /** 圆弧（点阵）：世界坐标 + 半径。 */
  arcs: { x: number; y: number; r: number }[];
}

/** 文字绘制**不产生批次**（canvas 里 fillText 是即时绘制），因此单独记，并带上当时的矩阵。 */
interface TextCall {
  text: string;
  x: number;
  y: number;
  matrix: Matrix;
}

/**
 * 记录绘制调用 + 维护真实矩阵语义的假 canvas。
 * 参数非法（NaN / 非正线宽 / 非有限半径）时**直接抛错** —— 真实 canvas 会静默画不出东西。
 */
function recorder(ctxNull = false): {
  canvas: HTMLCanvasElement;
  batches: Batch[];
  texts: TextCall[];
  ctxCalls: number;
} {
  let m: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: Matrix[] = [];
  const batches: Batch[] = [];
  let current: Batch['segments'] = [];
  let currentArcs: Batch['arcs'] = [];
  const texts: TextCall[] = [];
  let cursor: [number, number] | null = null;
  let calls = 0;

  const finite = (value: number, what: string): void => {
    calls += 1;
    if (!Number.isFinite(value)) throw new Error(`${what} 收到非有限数：${value}`);
  };
  const state = { fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1, globalAlpha: 1, font: '' };

  const raw = {
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: unknown) {
      state.fillStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: unknown) {
      state.strokeStyle = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      finite(value, 'lineWidth');
      state.lineWidth = value;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(value: number) {
      finite(value, 'globalAlpha');
      state.globalAlpha = value;
    },
    get font() {
      return state.font;
    },
    set font(value: string) {
      state.font = value;
    },
    save: () => stack.push({ ...m }),
    restore: () => {
      const prev = stack.pop();
      if (prev === undefined) throw new Error('restore 多于 save（矩阵栈失衡）');
      m = prev;
    },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      for (const v of [a, b, c, d, e, f]) finite(v, 'setTransform');
      m = { a, b, c, d, e, f };
    },
    translate: (x: number, y: number) => {
      finite(x, 'translate.x');
      finite(y, 'translate.y');
      m = { ...m, e: m.e + m.a * x + m.c * y, f: m.f + m.b * x + m.d * y };
    },
    scale: (x: number, y: number) => {
      finite(x, 'scale.x');
      finite(y, 'scale.y');
      m = { ...m, a: m.a * x, b: m.b * x, c: m.c * y, d: m.d * y };
    },
    clearRect: (x: number, y: number, w: number, h: number) => {
      for (const v of [x, y, w, h]) finite(v, 'clearRect');
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      for (const v of [x, y, w, h]) finite(v, 'fillRect');
    },
    beginPath: () => {
      current = [];
      currentArcs = [];
    },
    moveTo: (x: number, y: number) => {
      finite(x, 'moveTo.x');
      finite(y, 'moveTo.y');
      cursor = [x, y];
    },
    lineTo: (x: number, y: number) => {
      finite(x, 'lineTo.x');
      finite(y, 'lineTo.y');
      if (cursor !== null) current.push({ from: cursor, to: [x, y] });
      cursor = [x, y];
    },
    arc: (x: number, y: number, r: number) => {
      finite(x, 'arc.x');
      finite(y, 'arc.y');
      finite(r, 'arc.r');
      if (!(r > 0)) throw new Error(`arc 半径必须为正：${r}`);
      currentArcs.push({ x, y, r });
    },
    stroke: () => {
      if (!(state.lineWidth > 0)) throw new Error(`stroke 线宽必须为正：${state.lineWidth}`);
      batches.push({
        segments: current,
        arcs: [],
        width: state.lineWidth,
        alpha: state.globalAlpha,
        matrix: { ...m },
      });
      current = [];
    },
    fill: () => {
      batches.push({
        segments: [],
        arcs: currentArcs,
        width: state.lineWidth,
        alpha: state.globalAlpha,
        matrix: { ...m },
      });
      currentArcs = [];
    },
    fillText: (text: string, x: number, y: number) => {
      finite(x, 'fillText.x');
      finite(y, 'fillText.y');
      texts.push({ text, x, y, matrix: { ...m } });
    },
    setLineDash: (segments: number[]) => {
      for (const v of segments) finite(v, 'setLineDash');
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => (ctxNull ? null : (raw as unknown as CanvasRenderingContext2D)),
  } as unknown as HTMLCanvasElement;
  return { canvas, batches, texts, ctxCalls: calls };
}

/** 世界坐标 → 屏幕 CSS 像素（按记录的矩阵，并除掉 DPR）。 */
function toCss(point: [number, number], matrix: Matrix, dpr: number): [number, number] {
  const [x, y] = point;
  return [(matrix.a * x + matrix.c * y + matrix.e) / dpr, (matrix.b * x + matrix.d * y + matrix.f) / dpr];
}

const DPR = 2;
beforeEach(() => {
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(DPR);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** 造一份**真实体量**的图：21×21 交叉线、17 个枢纽、32 条边（与青云宗同量级）。 */
function denseGraph(): { items: CanvasGraphItem[]; links: CanvasGraphLink[] } {
  let seed = 20260915;
  const next = (max: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % max;
  };
  const items: CanvasGraphItem[] = [];
  const used = new Set<string>();
  while (items.length < 17) {
    const row = next(21);
    const col = next(21);
    const key = `${row},${col}`;
    if (used.has(key)) continue;
    used.add(key);
    items.push({ key: `n${items.length}`, row, col, content: null });
  }
  const links: CanvasGraphLink[] = [];
  const seen = new Set<string>();
  while (links.length < 32) {
    const a = items[next(items.length)]!;
    const b = items[next(items.length)]!;
    if (a.key === b.key) continue;
    const id = [a.key, b.key].sort().join('~');
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({ from: a.key, to: b.key, state: links.length % 3 === 0 ? 'active' : 'normal' });
  }
  return { items, links };
}

function sceneOf(items: CanvasGraphItem[], links: CanvasGraphLink[], showGrid: boolean): FrameScene {
  const cellPx = 48;
  return {
    size: { w: 900, h: 700 },
    segments: links.flatMap((link) => {
      const from = items.find((item) => item.key === link.from)!;
      const to = items.find((item) => item.key === link.to)!;
      return [
        {
          x1: from.col * cellPx,
          y1: from.row * cellPx,
          x2: to.col * cellPx,
          y2: to.row * cellPx,
          state: link.state,
        },
      ];
    }),
    style: paletteFromToken(TOKEN),
    showGrid,
    rows: 20,
    cols: 20,
    cellPx,
    items,
  };
}

const POSES = [
  { zoom: 0.5, panX: 0, panY: 0 },
  { zoom: 0.625, panX: 12, panY: -30 },
  { zoom: 1, panX: -100, panY: 40 },
  { zoom: 2.4, panX: 33.5, panY: -77.25 },
  { zoom: 4, panX: -900, panY: -900 },
];

describe('⭐ 两层对齐：canvas 画的连线端点 == DOM 枢纽的站位', () => {
  it.each(POSES)('zoom=$zoom pan=($panX,$panY) 下 32 条连线两端都与枢纽像素级重合', (pose) => {
    const { items, links } = denseGraph();
    const { canvas, batches } = recorder();
    const pins = new Map<string, [number, number]>();
    paintFrame(canvas, sceneOf(items, links, false), pose, (key, x, y) => pins.set(key, [x, y]));

    // 只画连线时，每个 stroke 批次恰好含 1 段；批次顺序与 links 一致
    const drawn = batches.flatMap((batch) =>
      batch.segments.map((segment) => ({ segment, matrix: batch.matrix, width: batch.width })),
    );
    expect(drawn).toHaveLength(links.length);

    for (const [index, { segment, matrix, width }] of drawn.entries()) {
      const from = toCss([segment.from[0], segment.from[1]], matrix, DPR);
      const to = toCss([segment.to[0], segment.to[1]], matrix, DPR);
      // 线宽按 1/zoom 折算 ⇒ 屏幕上恒定；且状态→线宽映射（active 更粗）必须保住
      const expectedWidth = (links[index]!.state === 'active' ? 2.5 : 1.5) / pose.zoom;
      expect(width).toBeCloseTo(expectedWidth, 9);
      // 端点必须落在某个枢纽的站位上（不依赖点的顺序）
      const allPins = [...pins.values()];
      expect(allPins.some(([x, y]) => Math.hypot(x - from[0], y - from[1]) < 1e-9)).toBe(true);
      expect(allPins.some(([x, y]) => Math.hypot(x - to[0], y - to[1]) < 1e-9)).toBe(true);
    }
  });

  it('18 个枢纽的站位与 canvas 世界坐标的换算完全一致（逐点比对，含负 pan 与极端 zoom）', () => {
    const { items, links } = denseGraph();
    const pose = { zoom: 1.875, panX: -213.5, panY: 66.25 };
    const { canvas, batches } = recorder();
    const pins: [string, number, number][] = [];
    paintFrame(canvas, sceneOf(items, links, false), pose, (key, x, y) => pins.push([key, x, y]));
    expect(pins).toHaveLength(items.length);
    const matrix = batches[0]!.matrix;
    for (const [key, x, y] of pins) {
      const item = items.find((entry) => entry.key === key)!;
      const css = toCss([item.col * 48, item.row * 48], matrix, DPR);
      expect(css[0]).toBeCloseTo(x, 9);
      expect(css[1]).toBeCloseTo(y, 9);
    }
  });

  it('DPR 只影响位图分辨率，不影响屏幕坐标（DPR=1 与 2 得到同一组站位）', () => {
    const { items, links } = denseGraph();
    const pose = POSES[2]!;
    const one = recorder();
    const onePins: [number, number][] = [];
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
    paintFrame(one.canvas, sceneOf(items, links, false), pose, (_k, x, y) => onePins.push([x, y]));

    const two = recorder();
    const twoPins: [number, number][] = [];
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    paintFrame(two.canvas, sceneOf(items, links, false), pose, (_k, x, y) => twoPins.push([x, y]));

    expect(twoPins).toEqual(onePins);
    // 但位图尺寸要按 DPR 放大（否则 HiDPI 会糊）
    expect(two.canvas.width).toBe(900 * 2);
    expect(one.canvas.width).toBe(900);
  });
});

describe('绘制参数合法性（真实 canvas 会静默画不出东西，这里直接抛错）', () => {
  it('21×21 点阵 + 32 连线 + 极端 zoom 下不产生任何 NaN / 非正线宽 / 非法半径', () => {
    const { items, links } = denseGraph();
    for (const pose of POSES) {
      const { canvas } = recorder();
      expect(() => paintFrame(canvas, sceneOf(items, links, true), pose, () => undefined)).not.toThrow();
    }
  });

  it('⭐ 轴标在 restore 之后绘制：文字用的矩阵必须是「仅 DPR」（否则轴标会被世界变换带偏）', () => {
    const { items, links } = denseGraph();
    const { canvas, texts, batches } = recorder();
    // 用一个整图可见的位姿：21+21 条轴标全都画得出来
    const fit = { zoom: 0.5, panX: 0, panY: 0 };
    paintFrame(canvas, sceneOf(items, links, true), fit, () => undefined);
    // 精确到两轴的标签集合：横轴 0..20（写在 y=12 那一行）；
    // 纵轴只画出 1..20 —— 第 0 条落在 y=0，被 `y >= 10` 的裁剪规则去掉（避免与顶边/横轴标签重叠）
    const xLabels = texts.filter((call) => call.y === 12);
    const yLabels = texts.filter((call) => call.x === 2 && call.y !== 12);
    expect(xLabels.map((call) => call.text)).toEqual(Array.from({ length: 21 }, (_, i) => String(i)));
    expect(yLabels.map((call) => call.text)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    expect(texts).toHaveLength(41);
    for (const call of texts) {
      expect(call.matrix).toEqual({ a: DPR, b: 0, c: 0, d: DPR, e: 0, f: 0 });
    }
    // 反过来：世界层的批次（点阵 / 连线）用的必须是 dpr×zoom —— 两层刻意分处两个空间
    for (const batch of batches) {
      expect(batch.matrix.a).toBeCloseTo(DPR * fit.zoom, 9);
    }
  });

  it('轴标越出视口时不绘制（不在画布外白画文字），且矩阵仍是「仅 DPR」', () => {
    const { items, links } = denseGraph();
    const { canvas, texts } = recorder();
    paintFrame(canvas, sceneOf(items, links, true), POSES[4]!, () => undefined); // zoom=4，绝大部分轴标在视口外
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.length).toBeLessThan(42);
    for (const call of texts) {
      expect(call.matrix).toEqual({ a: DPR, b: 0, c: 0, d: DPR, e: 0, f: 0 });
      expect(call.x).toBeLessThanOrEqual(900);
      expect(call.y).toBeLessThanOrEqual(700);
    }
  });

  it('点阵严格落在 i×cellPx 的交叉线上（点阵与世界坐标不能各算一套）', () => {
    const { items, links } = denseGraph();
    const pose = { zoom: 0.75, panX: 20, panY: 10 };
    const { canvas, batches } = recorder();
    paintFrame(canvas, sceneOf(items, links, true), pose, () => undefined);
    const gridBatch = batches.find((batch) => batch.segments.length > 20)!; // 网格线批次（21×2 条）
    const xs = new Set<number>();
    const ys = new Set<number>();
    for (const { from, to } of gridBatch.segments) {
      if (from[0] === to[0]) xs.add(from[0]);
      if (from[1] === to[1]) ys.add(from[1]);
    }
    // 21 条竖线 / 21 条横线，位置是 0,48,...,960
    expect([...xs].sort((a, b) => a - b)).toEqual(Array.from({ length: 21 }, (_, i) => i * 48));
    expect([...ys].sort((a, b) => a - b)).toEqual(Array.from({ length: 21 }, (_, i) => i * 48));
    // 交叉点阵 21×21 = 441 个
    const dots = batches.find((batch) => batch.arcs.length > 0)!;
    expect(dots.arcs).toHaveLength(441);
    for (const dot of dots.arcs) {
      expect(xs.has(dot.x)).toBe(true);
      expect(ys.has(dot.y)).toBe(true);
    }
  });
});
