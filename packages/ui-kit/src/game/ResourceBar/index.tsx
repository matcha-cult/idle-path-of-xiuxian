/**
 * ResourceBar —— 资源 / 经验 / 进度条，游戏语义通用组。
 *
 * 用途：灵石储量、修为进度、建造进度、体力等一切「当前值 / 上限」展示。
 * 约定：数值由调用方传入并在此做**纯展示安全夹取**（不参与任何游戏公式）；
 *       颜色与状态走 antd `Progress` 的 `status`，禁 hex。
 *
 * 插槽：`label`（条上方说明）、`suffix`（条右侧补充文案，如 `1200/2000`）、`tooltip`（整块悬浮说明）。
 * 实现说明：纵向 `Space` 用 antd v6 的 `orientation="vertical"`（`direction` 在 v6 已弃用）。
 * 边界（纯展示防御）：`max <= 0` → 0%；`current < 0` → 0%；`current > max` → 100%；
 *                     `current`/`max` 为 `NaN`/`Infinity`/`undefined` → 视为 0；
 *                     `showPercent=false` 时百分比文案为空串（有 `suffix` 则只显示 `suffix`）。
 */
import { Progress, Space, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';

export interface ResourceBarProps {
  /** 条上方说明（如「修为」）。 */
  label?: ReactNode;
  /** 当前值。 */
  current: number;
  /** 上限。 */
  max: number;
  /** 条右侧补充文案；提供时替代/追加百分比。 */
  suffix?: ReactNode;
  /** 是否显示百分比，缺省 `true`。 */
  showPercent?: boolean;
  /** antd `Progress` 状态，缺省为 antd 默认（`normal`）。 */
  status?: 'normal' | 'active' | 'success' | 'exception';
  /** 整块悬浮说明；缺省不包 `Tooltip`。 */
  tooltip?: ReactNode;
}

/** 任意入参 → 有限数；`NaN`/`Infinity`/`undefined` 一律视为 0。 */
function toFiniteNumber(value: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** 百分比保留 1 位小数，避免长尾小数污染文案。 */
function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

export function ResourceBar(props: ResourceBarProps) {
  const { label, current, max, suffix, showPercent = true, status, tooltip } = props;

  const safeCurrent = toFiniteNumber(current);
  const safeMax = toFiniteNumber(max);
  const rawPercent = safeMax > 0 ? (safeCurrent / safeMax) * 100 : 0;
  const percent = roundPercent(Math.min(100, Math.max(0, rawPercent)));

  const format = (value?: number): ReactNode => {
    const shown = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const percentText: ReactNode = showPercent ? `${shown}%` : null;
    if (percentText !== null && suffix !== undefined) {
      return (
        <>
          {percentText} {suffix}
        </>
      );
    }
    if (percentText !== null) return percentText;
    return suffix ?? '';
  };

  const body = (
    <Space orientation="vertical" data-testid="resource-bar-root">
      {label !== undefined && label !== null ? <Typography.Text type="secondary">{label}</Typography.Text> : null}
      <Progress percent={percent} status={status} format={format} />
    </Space>
  );

  return tooltip === undefined || tooltip === null ? body : <Tooltip title={tooltip}>{body}</Tooltip>;
}
