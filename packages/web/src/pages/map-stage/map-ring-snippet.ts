/**
 * 「复制环半径」要用的**代码生成 + 剪贴板**：把当前环半径变成一段**可直接贴回数据表**的源码。
 *
 * 为什么生成代码而不是生成数字（用户 2026-09-15 的批评）：让用户"把数字发我"是**把转录工作
 * 推给用户**，而且中间有三道人工翻译（他读 → 他判断哪个数对应哪个常量 → 我改代码），
 * 每一道都能错。直接生成
 *
 * ```
 * export const GATE_RING_CELLS = 14;
 * ```
 *
 * 这样的成品，用户贴给我、我贴进 `map-catalog.ts`，**没有任何翻译步骤**（也就没有翻译错误）。
 *
 * 纯函数：给同样的环表永远同样的输出，所以可以逐字断言。
 */
import { MAP_RINGS } from './map-catalog.js';
import type { MapRing } from './map-types.js';

/** 控制台里的前缀（一堆日志里能一眼认出来）。 */
export const SNIPPET_LOG_TITLE = '[环半径] 复制下面这段给开发者，即可写回数据表：';

/** 数字写法：整数不带小数点，最多两位小数（滑杆步长 0.5，但顺手防浮点渣）。 */
export function formatRadius(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

/**
 * 生成可粘贴的常量定义。顺序沿用环表（外环 → 二环 → 内环）；
 * **`fixed` 的环（中心恒为 0）与没有 `radiusConst` 的环会被跳过** —— 它们不需要写回数据表。
 */
export function ringRadiusSnippet(rings: readonly MapRing[] = MAP_RINGS): string {
  const lines = rings
    .filter((ring) => ring.fixed !== true && ring.radiusConst !== undefined)
    .map((ring) => `export const ${ring.radiusConst} = ${formatRadius(ring.radiusCells)};`);

  return [
    '// 由 ?mapStage=1 的「复制环半径」按钮生成',
    '// 贴进 packages/web/src/pages/map-stage/map-catalog.ts，覆盖同名常量即可',
    ...lines,
  ].join('\n');
}

/**
 * 把文本写进剪贴板；返回是否成功。
 *
 * 失败（浏览器不给权限 / 非安全上下文 / jsdom 没有这个 API）一律返回 `false`，
 * **不抛错**：调用方据此改走"内容已打到控制台"那条路 —— 一个"复制"按钮不该因为权限问题炸掉页面。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (clipboard === undefined) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
