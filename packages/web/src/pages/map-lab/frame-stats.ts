/**
 * 帧间隔统计（纯函数）—— 把「手感」里**真机能测**的那部分变成数字。
 *
 * 为什么需要它：`26 §3.1` 的 React 提交次数（60 帧拖动 0 vs 60）是**机制级**证据，
 * 说明渲染工作被移出了 React；但「真机掉不掉帧」只能在实际浏览器里量。本模块只做统计，
 * 采集在 `LabFrameMeter.tsx`（rAF 循环），因此统计口径可以脱离浏览器单测。
 *
 * 口径：
 * - **掉帧** = 帧间隔 > `slowMs`（默认 20ms，即 60Hz 下错过一帧的下限）；
 * - `fps` 由**平均**帧间隔折算（不是「1/最差帧」，否则一次抖动会把读数打到个位数）；
 * - 非法输入（`NaN` / `Infinity` / 负数）**直接跳过**，绝不污染平均值（否则一次异常读数
 *   会让整块读数变成 `NaN`，比不显示还糟）。
 */

/** 超过它就记一次掉帧：60Hz 的帧预算 16.7ms，20ms 是「明显错过一帧」的下限。 */
export const SLOW_FRAME_MS = 20;
/** 滑动窗口帧数（约 2 秒 @60Hz）：太短读不出稳定性，太长对操作反馈迟钝。 */
export const DEFAULT_WINDOW = 120;

export interface FrameSummary {
  /** 窗口内有效帧数。 */
  frames: number;
  /** 其中超过 `slowMs` 的帧数。 */
  dropped: number;
  /** 最差帧间隔（ms）。 */
  worstMs: number;
  /** 平均帧间隔（ms）。 */
  avgMs: number;
  /** 由平均帧间隔折算的 FPS。 */
  fps: number;
}

export const EMPTY_SUMMARY: FrameSummary = { frames: 0, dropped: 0, worstMs: 0, avgMs: 0, fps: 0 };

/** 一个间隔是否可用于统计：有限、非负。 */
function usable(delta: number): boolean {
  return Number.isFinite(delta) && delta >= 0;
}

/** 追加一帧间隔并裁剪到窗口长度（返回新数组，不改入参）。非法值直接丢弃。 */
export function pushFrame(
  deltas: readonly number[],
  delta: number,
  window: number = DEFAULT_WINDOW,
): number[] {
  const size = Number.isFinite(window) && window > 0 ? Math.trunc(window) : DEFAULT_WINDOW;
  if (!usable(delta)) return deltas.slice(-size);
  const next = [...deltas, delta];
  return next.length > size ? next.slice(next.length - size) : next;
}

/** 统计窗口；空窗口 / 全非法 → `EMPTY_SUMMARY`（而不是 NaN 读数）。 */
export function summarizeFrames(
  deltas: readonly number[],
  slowMs: number = SLOW_FRAME_MS,
): FrameSummary {
  const slow = Number.isFinite(slowMs) && slowMs > 0 ? slowMs : SLOW_FRAME_MS;
  const valid = deltas.filter(usable);
  if (valid.length === 0) return EMPTY_SUMMARY;
  let total = 0;
  let worst = 0;
  let dropped = 0;
  for (const delta of valid) {
    total += delta;
    if (delta > worst) worst = delta;
    if (delta > slow) dropped += 1;
  }
  const avg = total / valid.length;
  return {
    frames: valid.length,
    dropped,
    worstMs: worst,
    avgMs: avg,
    // 平均间隔为 0（同一毫秒内连来两帧）时按 0 处理，避免除零得出 Infinity
    fps: avg > 0 ? 1000 / avg : 0,
  };
}
