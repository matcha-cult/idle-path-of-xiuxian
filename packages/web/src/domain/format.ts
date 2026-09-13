/**
 * 数值展示格式化（**全仓唯一实现**）。
 *
 * 放置修仙里的资源会到万/亿级：`12345` 直接渲染在 HUD 上会挤爆布局，
 * 而 `1.2 万` 一眼可读。规则：
 * - 非有限数 → `'—'`；
 * - `|n| >= 1e8` → `X.X 亿`；`|n| >= 1e4` → `X.X 万`；其余按整数千分位；
 * - 保留 1 位小数且去掉多余的 `.0`（`10000 → '1 万'`，不是 `'1.0 万'`）。
 */
const WAN = 1e4;
const YI = 1e8;

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= YI) return `${sign}${trimZero(abs / YI)} 亿`;
  if (abs >= WAN) return `${sign}${trimZero(abs / WAN)} 万`;
  return `${sign}${Math.floor(abs)}`;
}

/** 计数（不做万/亿压缩，用于「共 N 件」这类小数值）。 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(Math.floor(value));
}
