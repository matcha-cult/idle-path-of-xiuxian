/**
 * `paintScene` 单测 —— 一帧的**全部**绘制都在这里，所以最重要的断言是**层序**：
 * 「圆要画在网格之上」「点要压在轨道之上」这类性质只有肉眼能看出来、而重构最容易打乱，
 * 因此用调用次序把它钉死，而不是等人在浏览器里发现「点被网格线盖住了」。
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
  colorSuccess: 'guide',
});

/** 2×2 格、每格 10px、pad 26 ⇒ 画布 72×72；世界原点 = (36,36)。 */
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
    setLineDash: () => calls.push('dash'),
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
    rings: [],
    marks: [],
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

describe('层序（"谁压在谁上面"的可执行版本）', () => {
  it('⭐ 网格线 → 悬停高亮 → 轨道环 → 功能点 → 光标标签', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(
      canvas,
      ctx,
      scene({
        hover: { col: 1, row: 1 },
        cursor: { x: 60, y: 60 },
        rings: [{ radiusCells: 1.5 }], // 1.5 格 × 10px = 15px
        marks: [{ at: { x: 0, y: 0 }, radiusCells: 0.5 }], // 0.5 格 × 10px = 5px
      }),
    );

    const firstGridStroke = calls.indexOf('stroke');
    const hover = calls.indexOf('strokeRect');
    const ring = calls.indexOf('arc(36,36,15)');
    const mark = calls.indexOf('arc(36,36,5)');
    const label = calls.indexOf('fillText:1,1');

    expect(firstGridStroke).toBeGreaterThan(-1);
    // 悬停高亮压在网格之上（否则会被格线切断）
    expect(hover).toBeGreaterThan(firstGridStroke);
    // 内容（轨道、点）压在悬停之上：内容不该被鼠标经过时染色
    expect(ring).toBeGreaterThan(hover);
    // 点压在轨道之上（点就落在环上，不能被环的线切成两半）
    expect(mark).toBeGreaterThan(ring);
    // 坐标标签压在最上面（视线在格子上时它必须可读）
    expect(label).toBeGreaterThan(mark);
  });
});

describe('轨道环（世界口径：半径以「格」为单位）', () => {
  it('半径按格换算成像素：2 格 × 10px = 20px，圆心在世界原点', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ rings: [{ radiusCells: 2 }] }));
    expect(calls).toContain('arc(36,36,20)');
  });

  it('⭐ 半径 0 的环（主峰所在的那条"环"）不画，但点照画', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(
      canvas,
      ctx,
      scene({
        rings: [{ radiusCells: 0 }],
        marks: [{ at: { x: 0, y: 0 }, radiusCells: 0.5 }],
      }),
    );
    expect(calls).not.toContain('arc(36,36,0)');
    expect(calls).toContain('arc(36,36,5)');
  });

  it('多环时每个环各画一次', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ rings: [{ radiusCells: 1 }, { radiusCells: 2 }, { radiusCells: 3 }] }));
    expect(calls).toContain('arc(36,36,10)');
    expect(calls).toContain('arc(36,36,20)');
    expect(calls).toContain('arc(36,36,30)');
  });
});

describe('功能点（世界口径：位置以「格」为单位，y 向上）', () => {
  it('⭐ 世界 +y ⇒ 屏幕向上（y 翻转只在 worldToScreen 一处）', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ marks: [{ at: { x: 1, y: 1 }, radiusCells: 0.5 }] }));
    // 世界 (1,1) ⇒ 屏幕 (36+10, 36−10) = (46,26)
    expect(calls).toContain('arc(46,26,5)');
  });

  it('世界 −y（正南）⇒ 屏幕向下', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(canvas, ctx, scene({ marks: [{ at: { x: 0, y: -2 }, radiusCells: 0.5 }] }));
    expect(calls).toContain('arc(36,56,5)');
  });

  it('每个点各画一次，半径由数据给（9 个点共用同一口径）', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    paintScene(
      canvas,
      ctx,
      scene({
        marks: [
          { at: { x: 0, y: 0 }, radiusCells: 0.5 },
          { at: { x: 2, y: 0 }, radiusCells: 0.5 },
          { at: { x: 0, y: 2 }, radiusCells: 0.5 },
        ],
      }),
    );
    expect(calls.filter((c) => c.startsWith('arc('))).toEqual(['arc(36,36,5)', 'arc(56,36,5)', 'arc(36,16,5)']);
  });
});

describe('降级路径', () => {
  it('几何不可用 ⇒ 返回 false，且只铺底：不画网格、不画环、不画点（不留脏点）', () => {
    const { canvas } = sceneCanvas();
    const { ctx, calls } = recorder();
    // 真实调用方在几何不可用时 `canvasSize` 也给 0×0（两个输入是自洽的）
    const drew = paintScene(
      canvas,
      ctx,
      scene({
        layout: { ...LAYOUT, cellPx: 0 },
        boxW: 0,
        boxH: 0,
        rings: [{ radiusCells: 9 }],
        marks: [{ at: { x: 0, y: 0 }, radiusCells: 0.5 }],
      }),
    );
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
