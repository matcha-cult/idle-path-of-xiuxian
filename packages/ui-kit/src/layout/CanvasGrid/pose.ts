/**
 * `pose` —— 视图**位姿**（缩放 + 平移）的纯数学。上一轮"一拖/一缩就瞬移"的根因就在这一层，
 * 所以它被单独拆出来、并且每条规则都有单测。
 *
 * ## 两套坐标，各管一段（不要混）
 * ```
 * 世界坐标  --worldToScreen-->  内容坐标  --pose-->  屏幕坐标
 * (格，y 向上)              (画布 CSS 像素，y 向下)      (用户看到的 CSS 像素)
 * ```
 * - `worldToScreen` 负责"世界 → 内容"（含唯一的 y 翻转）；
 * - 本文件负责"内容 → 屏幕"：`screen = content × scale + offset`。
 * 两段各自只有一个地方做变换，所以命中测试只要按同一条链**反向**走一遍就必然对得上。
 *
 * ## 「1 = 整图适配」这条口径
 * `cellPx` 仍然按容器**取整**算出来（所以 `scale = 1` 就是今天那张清晰、刚好铺满的网格），
 * 位姿只是在它之上叠缩放与平移。于是"复位"= `{scale: 1, offset: 0}`，
 * 而读数里的 `100%` 正好等于"整图适配"，不用额外解释。
 *
 * ## 夹紧（旧版瞬移的根因）
 * 夹紧**必须知道视口尺寸**：内容比视口小 ⇒ 那一轴**居中**（不允许拖走，于是拖动不会跳）；
 * 内容比视口大 ⇒ 内容边缘不得进到视口内部。旧版只夹了内容自身范围、没夹视口，
 * 于是"适配后有一轴是留白"的情况下，一拖就被公式甩到左边 —— 这个 case 有专门单测。
 */

export interface Pose {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** 缩放上下限：下限允许缩到"适配的一半"（看全图），上限 8 倍（看清单个点）。 */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;

/** 滚轮每 100 单位 deltaY 对应一档；指数映射 ⇒ 缩放手感均匀（不会"越缩越猛"）。 */
export const WHEEL_ZOOM_BASE = 1.0015;

/** 整图适配位姿（= 复位）。偏移会在 `clampPose` 里被算成"居中"（内容比视口小的时候）。 */
export const FIT_POSE: Pose = { scale: 1, offsetX: 0, offsetY: 0 };

/** 夹到缩放上下限；非数 ⇒ 1（宁可回到适配，也不要 NaN）。 */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** 单轴夹紧：内容短于视口 ⇒ 居中；长于视口 ⇒ 边缘不进视口内。`scaledLen` 是**乘过缩放**的长度。 */
function clampAxis(scaledLen: number, viewLen: number, offset: number): number {
  if (!Number.isFinite(scaledLen) || !Number.isFinite(viewLen)) return 0;
  if (scaledLen <= viewLen) return (viewLen - scaledLen) / 2;
  const safe = Number.isFinite(offset) ? offset : 0;
  return Math.min(0, Math.max(viewLen - scaledLen, safe));
}

/**
 * 把位姿夹进合法范围（**每次改动位姿的最后一步都必须过这里**）。
 * 内容/视口尺寸非法 ⇒ 只夹缩放、偏移归 0（不猜）。
 */
export function clampPose(pose: Pose, content: Size, viewport: Size): Pose {
  const scale = clampScale(pose.scale);
  if (!Number.isFinite(content.w) || !Number.isFinite(content.h) || content.w <= 0 || content.h <= 0) {
    return { scale, offsetX: 0, offsetY: 0 };
  }
  return {
    scale,
    offsetX: clampAxis(content.w * scale, viewport.w, pose.offsetX),
    offsetY: clampAxis(content.h * scale, viewport.h, pose.offsetY),
  };
}

/** 内容 → 屏幕。 */
export function toScreen(x: number, y: number, pose: Pose): Point {
  return { x: x * pose.scale + pose.offsetX, y: y * pose.scale + pose.offsetY };
}

/** 屏幕 → 内容（`toScreen` 的逆；命中测试用它把指针换算回内容坐标）。 */
export function toContent(x: number, y: number, pose: Pose): Point {
  if (!Number.isFinite(pose.scale) || pose.scale === 0) return { x: 0, y: 0 };
  return { x: (x - pose.offsetX) / pose.scale, y: (y - pose.offsetY) / pose.scale };
}

/**
 * 以 `anchor`（**屏幕坐标**）为定点缩放：`anchor` 底下的内容点在缩放前后**不动**。
 *
 * 这是"滚轮缩放手感对不对"的判据 —— 如果按左上角或画布中心缩放，用户会觉得
 * "我想看的地方跑掉了"。公式对 y 翻转不敏感（本层在内容空间之上，与 y 方向无关）。
 */
export function zoomAt(
  pose: Pose,
  factor: number,
  anchor: Point,
  content: Size,
  viewport: Size,
): Pose {
  if (!Number.isFinite(factor) || factor <= 0) return clampPose(pose, content, viewport);
  const scale = clampScale(pose.scale * factor);
  const ratio = scale / pose.scale;
  const offsetX = anchor.x - (anchor.x - pose.offsetX) * ratio;
  const offsetY = anchor.y - (anchor.y - pose.offsetY) * ratio;
  return clampPose({ scale, offsetX, offsetY }, content, viewport);
}

/** 平移（屏幕像素增量）。 */
export function panBy(pose: Pose, dx: number, dy: number, content: Size, viewport: Size): Pose {
  return clampPose(
    { scale: pose.scale, offsetX: pose.offsetX + (Number.isFinite(dx) ? dx : 0), offsetY: pose.offsetY + (Number.isFinite(dy) ? dy : 0) },
    content,
    viewport,
  );
}

/** 内容在屏幕上的矩形（读数/排查用；夹紧是否正确，看这个矩形就一目了然）。 */
export function contentScreenRect(pose: Pose, content: Size): { x: number; y: number; w: number; h: number } {
  return {
    x: pose.offsetX,
    y: pose.offsetY,
    w: content.w * pose.scale,
    h: content.h * pose.scale,
  };
}

/**
 * 位姿是否"没被缩放过"（= 仍是整图适配）。
 *
 * 只看 `scale`：`cellPx` 是按容器取整适配出来的，所以 **`scale = 1` 时内容一定整个装得下**，
 * 此时两轴都会被夹成"居中"，偏移没有自由度 —— 换句话说"能拖动"与"缩放 ≠ 1"是等价的。
 * 容器变尺寸时据此决定"要不要复位"（缩放过就别乱动用户的视角）。
 */
export function isFitPose(pose: Pose): boolean {
  return pose.scale === FIT_POSE.scale;
}
