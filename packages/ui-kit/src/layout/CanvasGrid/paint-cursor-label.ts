/**
 * `paintCursorLabel` —— 在光标旁画一枚「列,行」标签（`显示坐标` 的**画布内**那一半）。
 *
 * 为什么要跟着光标画，而不是只写页面读数：用户的验收标准是「鼠标移动到网格显示坐标」——
 * 视线在格子上时，答案就该在格子上；页面读数（`MapStageReadout`）是给**排查**用的第二份。
 *
 * 夹边规则（都有单测）：默认落在光标右下；右边放不下翻到左侧；上方放不下翻到下方；
 * 最后再夹进画布内。文字宽度用 `measureText` 实测，不靠「汉字/数字宽度差不多」这类猜测。
 *
 * 底色用 `background` + `foreground` **反色**（`colorText` / `colorBgContainer`），
 * 于是亮暗主题自动都对，不需要为暗色单独写一份配色。
 */
import type { GridPaintContext2D } from './paint-grid.js';

export interface CursorLabelInput {
  /** 要显示的文字（如 `12, 7`） */
  text: string;
  /** 光标在画布内的 CSS 像素坐标 */
  x: number;
  y: number;
  /** 画布 CSS 尺寸：用来把标签夹在画布内 */
  width: number;
  height: number;
  fontPx: number;
  fontFamily: string;
  /** 标签底色 */
  background: string;
  /** 标签文字色 */
  foreground: string;
}

/** 水平/垂直偏移：让标签不盖住光标本身（光标尖在左上，因此默认往右下让开）。 */
const OFFSET = 14;
const BOX_PAD_X = 12;
const BOX_PAD_Y = 10;

export function paintCursorLabel(ctx: GridPaintContext2D, input: CursorLabelInput): void {
  const { text, x, y, width, height, fontPx, fontFamily, background, foreground } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

  ctx.save();
  ctx.font = `${fontPx}px ${fontFamily}`;
  const boxW = ctx.measureText(text).width + BOX_PAD_X;
  const boxH = fontPx + BOX_PAD_Y;

  let bx = x + OFFSET;
  if (bx + boxW > width) bx = x - OFFSET - boxW;
  bx = Math.max(0, Math.min(bx, width - boxW));

  let by = y - boxH - OFFSET / 2;
  if (by < 0) by = y + OFFSET + OFFSET / 2;
  by = Math.max(0, Math.min(by, height - boxH));

  ctx.globalAlpha = 1;
  ctx.fillStyle = background;
  ctx.fillRect(bx, by, boxW, boxH);

  ctx.fillStyle = foreground;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + boxW / 2, by + boxH / 2);
  ctx.restore();
}
