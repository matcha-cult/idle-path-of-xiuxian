/**
 * `paintScene` 单测 —— 一帧的**全部**绘制都在这里，所以最重要的断言是**层序**：
 * 用户说的「圆要画在网格之上」是一条只有肉眼能看出来、而重构最容易打乱的性质，
 * 因此用调用次序把它钉死（网格的 `stroke` 必须早于中心圆的 `arc`），
 * 而不是等人在浏览器里发现「圆被网格线盖住了」。
 *
 * 其次是位图尺寸：`canvas.width/height = CSS × dpr`，且**只在变化时写**。
 */
import { describe, expect, it } from 'vitest';
import { gridPalette } from './palette.js';
import { paintScene } from './paint-scene.js';
import type { SceneCanvas, SceneInput } from './paint-scene.js';
import type { GridPaintContext2D } from './paint-grid.js';

const PALETTE = gridPalette({
  colorBgContainer: 'bg',
  colorBorderSecondary: 'border-2',
  colorBorder: 'border-1',
  colorPrimary: 'primary',
  colorTextTertiary: 'text-3',
  colorWarning: 'mark',
});

/** 2×2 格、每格 10px、pad 26 ⇒ 画布 72×72；中心 = (36,36)，中心圆半径 = 5。 */
const LAYOUT = { rows: 2, cols: 2, cellPx: 10, pad: 26 };

interface Recorder {
  ctx: GridPaintContext2D;
  calls: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const raw = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    setTransform: (a: number) => calls.push(`setTransform(${a})`),
    clearRect: () => calls.push('clearRect'),
    fillRect: () => calls.push('fillRect'),
    strokeRect: () => calls.push('strokeRect'),
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    stroke: () => calls.push('stroke'),
    fill: () => calls.push(`fill@${raw.fillStyle}`),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    fillText: (text: string) => calls.push(`fillText:${text}`),
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  return { ctx: raw as unknown as GridPaintContext2D, calls };
}

/** 假画布：记录 `width/height` 被写了多少次（用于断言「只在变化时写」）。 */
function sceneCanvas(w = 0, h = 0): { canvas: SceneCanvas; writes: string[] } {
  const writes: string[] = [];
  const canvas = {
    innerW: w,
    innerH: h,
    get width(): number {
      return this.innerW;
    },
    set width(value: number) {
      this.innerW = value;
      writes.push(`width=${value}`);
    },
    get height(): number {
      return this.innerH;
    },
    set height(value: number) {
      this.innerH = value;
      writes.push(`height=${value}`);
    },
  };
  return { canvas: canvas as SceneCanvas, writes };
}

function scene(over: Partial<SceneInput> = {}): SceneInput {
  return {
    layout: LAYOUT,
    boxW: 72,
    boxH: 72,
    dpr: 1,
    hover: null,
    cursor: null,
    majorStep: 5,
    showCursorLabel: true,
    fontFamily: 'sans',
    cursorLabelBackground: 'ink',
    cursorLabelForeground: 'bg',
    palette: PALETTE,
    ...over,
  };
}

const indexOf = (calls: string[], prefix: string): number => calls.findIndex((c) => c.startsWith(prefix));

describe('位图尺寸与坐标变换', () => {
  it('位图 = CSS 尺寸 × dpr，且绘制前先 setTransform 回 CSS 坐标系', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ dpr: 2 }));
    expect(canvas.width).toBe(144);
    expect(canvas.height).toBe(144);
    expect(calls[0]).toBe('setTransform(2)');
  });

  it('尺寸没变就不重复写 width/height（写它会清空画布并重置上下文状态）', () => {
    const { canvas, writes } = sceneCanvas();
    const { ctx } = recorder();
    paintScene(canvas, ctx, scene());
    expect(writes).toEqual(['width=72', 'height=72']);
    paintScene(canvas, ctx, scene());
    expect(writes).toEqual(['width=72', 'height=72']);
  });
});

describe('层序（这一段就是"圆在网格之上"的可执行版本）', () => {
  it('⭐ 网格线 → 悬停高亮 → 中心圆 → 光标标签', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ hover: { col: 1, row: 1 }, cursor: { x: 60, y: 60 } }));

    const lastGridStroke = calls.lastIndexOf('stroke');
    const hover = indexOf(calls, 'strokeRect');
    const circle = indexOf(calls, 'arc(');
    const label = indexOf(calls, 'fillText:1,1');

    expect(lastGridStroke).toBeGreaterThan(-1);
    // 悬停高亮压在网格之上（否则会被格线切断）
    expect(hover).toBeGreaterThan(lastGridStroke);
    // 中心圆压在悬停之上：内容不该被鼠标经过时染色（用户要求「圆在网格之上」的强版本）
    expect(circle).toBeGreaterThan(hover);
    // 坐标标签压在最上面（视线在格子上时它必须可读）
    expect(label).toBeGreaterThan(circle);
  });
});

describe('中心圆', () => {
  it('圆心在坐标系中心、直径 = 1 格（2 格布局 ⇒ 圆心 (36,36)、半径 5）', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene());
    expect(calls).toContain('arc(36,36,5)');
    expect(calls).toContain('fill@mark');
  });

  it('几何不可用 ⇒ 返回 false，且只铺底：不画网格、不画圆（不留脏点）', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    // 真实调用方在几何不可用时 `canvasSize` 也给 0×0（两个输入是自洽的）
    const drew = paintScene(canvas, ctx, scene({ layout: { ...LAYOUT, cellPx: 0 }, boxW: 0, boxH: 0 }));
    expect(drew).toBe(false);
    expect(canvas.width).toBe(0);
    expect(indexOf(calls, 'arc(')).toBe(-1);
    expect(calls).not.toContain('stroke');
    expect(calls).toContain('fillRect'); // 底色仍然铺（否则容器里会留上一帧残影）
  });
});

describe('光标坐标标签', () => {
  it('hover + 光标位置都有时才画标签', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ hover: { col: 0, row: 0 }, cursor: { x: 30, y: 30 } }));
    expect(calls).toContain('fillText:0,0');
  });

  it('showCursorLabel=false ⇒ 不画标签，但轴标照旧（轴标是网格的一部分）', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ hover: { col: 0, row: 0 }, cursor: { x: 30, y: 30 }, showCursorLabel: false }));
    expect(calls).not.toContain('fillText:0,0');
    expect(calls).toContain('fillText:0');
  });

  it('只有 hover 没有光标位置（键盘/触摸进来）⇒ 不画标签，也不崩', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ hover: { col: 0, row: 0 }, cursor: null }));
    expect(calls).not.toContain('fillText:0,0');
  });
});
