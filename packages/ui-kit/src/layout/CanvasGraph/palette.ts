/**
 * `CanvasGraph` 的**绘制配色**（全部来自 antd token，**禁内联 hex**）。
 *
 * canvas 的绘制调用拿不到 CSS 变量，所以必须把 token **取值后喂进去** —— 这也是全 canvas
 * 路线被列出的代价之一（`19-...md` §10 第 3 条）。本文件把「取 token」与「画」分开：
 * `palette.ts` 只做映射（纯函数、可单测），`paint.ts` 只做绘制（拿不到 React 上下文也能测）。
 *
 * 入参用**结构化最小接口**而不是 antd 的 `GlobalToken` 深路径类型：
 * 既避免依赖 antd 内部路径，也让单测可以直接喂一个字面量对象。
 */

/** 一组线型（颜色 + 屏幕像素线宽 + 透明度）。 */
export interface CanvasStrokeStyle {
  color: string;
  /** **屏幕**像素线宽（绘制时会按 zoom 折算，保证放大后线不会变成大粗条）。 */
  width: number;
  alpha: number;
}

export interface CanvasPaintStyle {
  background: string;
  /** 世界矩形外框（让「地图边界」可见）。 */
  worldBorder: string;
  gridLine: string;
  gridDot: string;
  axisText: string;
  /** 轴标字号（屏幕像素，不随 zoom 变化）。 */
  axisFontSize: number;
  link: CanvasStrokeStyle;
  linkActive: CanvasStrokeStyle;
  linkLocked: CanvasStrokeStyle;
}

/** 取 token 所需的最小结构（antd `GlobalToken` 结构兼容，便于单测喂字面量）。 */
export interface CanvasPaletteSource {
  colorBgContainer: string;
  colorBorderSecondary: string;
  colorBorder: string;
  colorTextQuaternary: string;
  colorTextTertiary: string;
  colorPrimary: string;
}

/** token → 绘制配色。缺字段时回退到同族 token，绝不抛错（主题中途切换也能画）。 */
export function paletteFromToken(token: CanvasPaletteSource): CanvasPaintStyle {
  const text = (value: string | undefined, fallback: string): string => value ?? fallback;
  return {
    background: text(token.colorBgContainer, 'transparent'),
    worldBorder: text(token.colorBorder, 'currentColor'),
    gridLine: text(token.colorBorderSecondary, 'currentColor'),
    gridDot: text(token.colorTextQuaternary, 'currentColor'),
    axisText: text(token.colorTextTertiary, 'currentColor'),
    axisFontSize: 10,
    link: { color: text(token.colorTextTertiary, 'currentColor'), width: 1.5, alpha: 0.45 },
    linkActive: { color: text(token.colorPrimary, 'currentColor'), width: 2.5, alpha: 0.9 },
    linkLocked: { color: text(token.colorTextQuaternary, 'currentColor'), width: 1.5, alpha: 0.35 },
  };
}
