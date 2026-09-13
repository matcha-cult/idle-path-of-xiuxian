/**
 * StatItem —— 单项统计数值（标签 + 数值 + 前后缀）。
 *
 * 用途：战力、灵石、修为等单值指标展示；可单独使用，也是 `StatGrid` 的单元。
 *
 * 边界：
 * - `value` 为 `NaN` / `Infinity` / `-Infinity` 时统一显示 `'-'`，绝不把非有限数交给 antd；
 * - `precision` 仅在数值（且有限）时透传，字符串直通不参与格式化；
 * - `loading` 交给 antd `Statistic` 的骨架能力（内部即 `Skeleton`）。
 */
import { Statistic } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

export interface StatItemProps {
  /** 指标名。 */
  label: ReactNode;
  /** 指标值；非有限数值降级为 `'-'`。 */
  value: number | string;
  /** 前缀（图标等）。 */
  prefix?: ReactNode;
  /** 后缀（单位等）。 */
  suffix?: ReactNode;
  /** 小数位数（仅对有限数值生效）。 */
  precision?: number;
  /** 数值区样式（映射到 antd `styles.content`）。 */
  valueStyle?: CSSProperties;
  /** 加载态。 */
  loading?: boolean;
}

/** 非有限数值的统一占位符。 */
const NON_FINITE_PLACEHOLDER = '-';

export function StatItem(props: StatItemProps) {
  const { label, value, prefix, suffix, precision, valueStyle, loading } = props;

  const display: number | string =
    typeof value === 'number' && !Number.isFinite(value) ? NON_FINITE_PLACEHOLDER : value;

  return (
    <Statistic
      data-testid="stat-item-root"
      title={label}
      value={display}
      prefix={prefix}
      suffix={suffix}
      precision={typeof display === 'number' ? precision : undefined}
      styles={valueStyle ? { content: valueStyle } : undefined}
      loading={loading}
    />
  );
}
