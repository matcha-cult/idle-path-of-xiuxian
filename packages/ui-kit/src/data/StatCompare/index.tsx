/**
 * StatCompare —— 达标对比（指标名 + 当前 / 门槛 + 是否达标 + 差额）。
 *
 * 用途：秘境准入、任务条件等「够不够」的单行判定；**不是**进度展示
 * （进度条是 `ResourceBar` 的职责），因此这里只用 `Flex/Typography/Tag` 组合。
 *
 * 约定：
 * - 颜色只用 antd `Tag` 预设状态色名（`success` / `error`），禁止内联 hex；
 * - 数值不经任何格式化库加工（`String()` 直出），展示精度由调用方负责；
 * - 纯展示、受控、无副作用，不 import 任何业务包。
 *
 * 边界：
 * - `current` / `target` 任一非有限（NaN / ±Infinity）→ 数值段显示 `—`，结论按未达标，差额 `—`；
 * - `target <= 0` → 视为「无门槛」，恒达标且差额 `—`；
 * - 负数照常参与比较（如 current=-5 / target=10 → 差 15）；
 * - 差额保留 1 位小数并去掉多余的 `.0`。
 */
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Flex, Tag, Tooltip, Typography, theme } from 'antd';
import type { ReactNode } from 'react';

export interface StatCompareProps {
  /** 指标名（如「战力」）。 */
  label: ReactNode;
  /** 当前值。 */
  current: number;
  /** 门槛值。 */
  target: number;
  /** 数值后缀（如「层」「点」）。 */
  suffix?: ReactNode;
  /** 达标文案，缺省「已达标」。 */
  okText?: ReactNode;
  /** 未达标文案，缺省「未达标」。 */
  failText?: ReactNode;
  /** 标签右侧提示。 */
  tooltip?: ReactNode;
}

/** 非有限数 / 无门槛时差额的统一占位符。 */
const PLACEHOLDER = '—';

/** 达标 / 未达标的差额动词。 */
const DELTA_PREFIX = { ok: '超出', fail: '差' } as const;

/** 保留 1 位小数并去掉多余的 `.0`（先四舍五入，规避 0.1+0.2 这类浮点尾巴）。 */
function formatDelta(delta: number): string {
  return (Math.round(delta * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export function StatCompare(props: StatCompareProps) {
  const { label, current, target, suffix, okText, failText, tooltip } = props;
  const { token } = theme.useToken();

  // 先判有限性：任一非有限都无法比较，按未达标处理。
  const comparable = Number.isFinite(current) && Number.isFinite(target);
  // 门槛 <= 0（含 0）视为无门槛，恒达标。
  const noThreshold = comparable && target <= 0;
  const ok = comparable && (noThreshold || current >= target);

  const valuesText = comparable ? `${String(current)} / ${String(target)}` : PLACEHOLDER;
  const deltaText =
    comparable && !noThreshold ? `${DELTA_PREFIX[ok ? 'ok' : 'fail']} ${formatDelta(Math.abs(target - current))}` : PLACEHOLDER;

  return (
    <Flex data-testid="stat-compare-root" align="center" wrap gap={token.marginXS}>
      <Flex align="center" gap={token.marginXXS}>
        <Typography.Text data-testid="stat-compare-label">{label}</Typography.Text>
        {tooltip === undefined || tooltip === null ? null : (
          <Tooltip title={tooltip}>
            <Typography.Text
              type="secondary"
              role="img"
              aria-label="指标说明"
              data-testid="stat-compare-tooltip-trigger"
            >
              <QuestionCircleOutlined />
            </Typography.Text>
          </Tooltip>
        )}
      </Flex>
      <Typography.Text strong data-testid="stat-compare-values">
        {valuesText}
        {suffix === undefined || suffix === null ? null : <> {suffix}</>}
      </Typography.Text>
      <Tag color={ok ? 'success' : 'error'} role="status" data-testid="stat-compare-verdict">
        {ok ? (okText ?? '已达标') : (failText ?? '未达标')}
      </Tag>
      <Typography.Text type="secondary" data-testid="stat-compare-delta">
        {deltaText}
      </Typography.Text>
    </Flex>
  );
}
