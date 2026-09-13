/**
 * 时长格式化（纯函数，唯一实现）。
 *
 * 为什么必须有：原型上直接渲染 `idle.status.pendingHours` 会得到
 * `2.0210366666666667 小时`（裸浮点），玩家界面上属于明显缺陷。
 *
 * 规则（对「剩余/累积时长」用向下取整，避免显示比实际更长）：
 * - 非有限数（`NaN`/`±Infinity`）或负数 → `'—'`；
 * - 恰好 0 → `'0 分'`；不足 1 分钟 → `'<1 分'`；
 * - 不足 1 小时 → `'N 分'`；
 * - 整小时 → `'N 小时'`；否则 `'N 小时 M 分'`。
 */
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours === 0) return '0 分';

  const totalMinutes = Math.floor(hours * 60 + 1e-9);
  if (totalMinutes < 1) return '<1 分';
  if (totalMinutes < 60) return `${totalMinutes} 分`;

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}
