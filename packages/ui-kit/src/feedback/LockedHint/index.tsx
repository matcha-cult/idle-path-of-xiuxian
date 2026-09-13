/**
 * LockedHint —— 未解锁门槛提示（什么被锁了 + 锁定原因 + 需要 / 当前）。
 *
 * 用途：秘境、剧情、任务等入口的「还差什么才能进」提示条。组件只做展示，
 * **不查任何业务数据、不显示境界名**：原因文案由 `reason` 类别决定，调用方
 * 可用 `hint` 覆盖为业务文案（如「需先推进：青云山脚 第 5 层」）。
 *
 * 约定：
 * - 用 antd `Alert`（`type="warning"` + `showIcon`）承载 `title` 与说明；
 * - 纯展示、受控、无副作用，不 import 任何业务包，颜色只用 token / antd 默认色。
 *
 * 边界：
 * - `required` / `current` 为 `0` 时正常显示 `0`（不做 falsy 判断）；
 * - 任一为非有限数（NaN / ±Infinity）→ 该行整体显示 `—`；
 * - 两者都不给 → 不渲染该行，绝不出现 `undefined` / `null` 字样。
 */
import { Alert, Flex, Typography, theme } from 'antd';
import type { ReactNode } from 'react';

/** 锁定原因类别：境界不足 / 需先推进前置 / 其他条件未满足。 */
export type LockedReason = 'realm' | 'prev' | 'objective';

export interface LockedHintProps {
  /** 一句话说明什么被锁了（如「秘境：落霞谷」）。 */
  title: ReactNode;
  /** 锁定原因类别。 */
  reason: LockedReason;
  /** 需要的值（如需要境界 5）。 */
  required?: number;
  /** 当前值（如当前境界 3）。 */
  current?: number;
  /** 额外说明（调用方给的业务文案，如「需先推进：青云山脚 第 5 层」）。 */
  hint?: ReactNode;
}

/** `reason` 对应的默认原因文案（不含任何业务数据 / 境界名）。 */
const REASON_TEXT: Record<LockedReason, string> = {
  realm: '境界不足',
  prev: '需先推进前置秘境',
  objective: '条件未满足',
};

/** 非有限数时「需要 / 当前」行的统一占位符。 */
const PLACEHOLDER = '—';

/**
 * 拼「需要 X · 当前 Y」行：
 * 两者都没给 → `undefined`（调用方据此不渲染该行）；任一非有限 → `—`；
 * 只给一个 → 只显示那一段（`0` 照常显示）。
 */
function formatRequirement(required?: number, current?: number): string | undefined {
  const requiredValue: number | undefined = required ?? undefined;
  const currentValue: number | undefined = current ?? undefined;

  if (requiredValue === undefined && currentValue === undefined) return undefined;
  if (requiredValue !== undefined && !Number.isFinite(requiredValue)) return PLACEHOLDER;
  if (currentValue !== undefined && !Number.isFinite(currentValue)) return PLACEHOLDER;

  if (requiredValue !== undefined && currentValue !== undefined) {
    return `需要 ${requiredValue} · 当前 ${currentValue}`;
  }
  if (requiredValue !== undefined) return `需要 ${requiredValue}`;
  return `当前 ${currentValue}`;
}

export function LockedHint(props: LockedHintProps) {
  const { title, reason, required, current, hint } = props;
  const { token } = theme.useToken();

  const reasonText = REASON_TEXT[reason] ?? REASON_TEXT.objective;
  const requirement = formatRequirement(required, current);

  return (
    <Alert
      data-testid="locked-hint-root"
      type="warning"
      showIcon
      title={title}
      description={
        <Flex vertical gap={token.marginXXS}>
          <Typography.Text data-testid="locked-hint-description">{hint ?? reasonText}</Typography.Text>
          {requirement === undefined ? null : (
            <Typography.Text type="secondary" data-testid="locked-hint-requirement">
              {requirement}
            </Typography.Text>
          )}
        </Flex>
      }
    />
  );
}
