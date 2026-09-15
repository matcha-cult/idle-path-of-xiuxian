/**
 * `snapLine` —— 把直线的**中心**对齐到设备像素网格。这是"1px 线清晰"的唯一一步。
 *
 * ## 为什么不能写死 `+0.5`
 * 一条 1 **CSS** px 的线在 dpr=2 的屏幕上宽 2 个**设备**像素 —— 这时落在整数 CSS 坐标上就是
 * 清晰的；而 dpr=1 / dpr=3 时宽 1 / 3 个设备像素，必须落在**半像素**上才清晰。
 * 旧实现（`crisp` = `round(v) + 0.5`）只在 dpr=1 且内容空间不缩放时成立，
 * 一旦叠上非整数缩放（`scale = 1.7`）就整片发虚 —— 这正是"放大后线又粗又虚"的成因之一。
 *
 * ## 判据
 * 设备覆盖区间 `[c − w/2, c + w/2]` 的两端都落在整数设备像素边界上 ⇔ `c = m + w/2`
 * （`w` = 设备像素宽，`m` 为整数）。于是：
 * - `w` 为偶数 ⇒ 中心落在整数设备坐标（dpr=2、1 CSS px 的情况）；
 * - `w` 为奇数 ⇒ 中心落在半整数（dpr=1、dpr=3 的情况）。
 *
 * 这个函数只做像素对齐，**不改变几何**：位移上界是半个设备像素（`0.5 / dpr` CSS px），
 * 所以缩放锚点、平移手感都不会被它带偏。
 */

/** 网格线宽（CSS px）：细线与主线都是 1px，靠**颜色**而不是粗细区分。 */
export const HAIRLINE_PX = 1;

/**
 * 把宽度 `widthCssPx` 的竖线（对齐 x）/ 横线（对齐 y）中心对齐到设备像素网格。
 *
 * 非法输入一律降级而不是产生 NaN：非有限坐标原样返回；`dpr ≤ 0` / 非数按 1 处理；
 * 宽度非正按 1 CSS px 处理（宁可画错也不画丢）。
 */
export function snapLine(cssPos: number, dpr: number, widthCssPx: number = HAIRLINE_PX): number {
  if (!Number.isFinite(cssPos)) return cssPos;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const width = Number.isFinite(widthCssPx) && widthCssPx > 0 ? widthCssPx : HAIRLINE_PX;
  const deviceWidth = Math.max(1, Math.round(width * ratio));
  return (Math.round(cssPos * ratio - deviceWidth / 2) + deviceWidth / 2) / ratio;
}
