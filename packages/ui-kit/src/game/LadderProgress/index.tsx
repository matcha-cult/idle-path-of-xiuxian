/**
 * LadderProgress —— 层数阶梯（第 1..N 层：已通过 / 当前 / 未到）。
 *
 * 用途：秘境 3 层、章节阶段这类「线性且层数很少」的进度展示。与 `ResourceBar` 的分工：
 * - `ResourceBar` 回答「**本层**还差多少」（连续量、百分比）；
 * - `LadderProgress` 回答「**整条阶梯**走到哪了」（离散层、逐层状态）。
 *
 * 约定：
 * - 状态语义只有三档（`done` / `current` / `pending`），**由调用方决定**，本组件不推导规则；
 * - 颜色只用 antd `Steps` 的语义状态（finish / process / wait），禁止内联 hex；
 * - 不传 `size`（紧凑由全局 `compactAlgorithm` 承担）；
 * - 文字放 `titlePlacement="vertical"`：antd v6 起 `labelPlacement` 已**弃用**
 *   （`antd --version 6.6.3 info Steps` 可查；踩过一次，勿回退）；
 * - 纯展示、受控、无副作用，不 import 任何业务包。
 *
 * 边界：
 * - `steps` 为空 → 渲染 `emptyText`（缺省 `—`），不抛错、不渲染空壳；
 * - `label` 为空 → 不渲染标题行；
 * - `state` 出现未知值（外部数据）→ 按 `pending` 处理（保守：不谎报已完成）。
 */
import { Flex, Steps, Typography } from 'antd';
import type { ReactNode } from 'react';

/** 单层状态：已通过 / 当前所在 / 未到。 */
export type LadderStepState = 'done' | 'current' | 'pending';

export interface LadderStep {
  /** 稳定 key（React key 用；不上屏）。 */
  key: string;
  /** 该层的展示文案（如「第 1 层」）。 */
  label: ReactNode;
  state: LadderStepState;
}

export interface LadderProgressProps {
  steps: readonly LadderStep[];
  /** 阶梯上方的说明文字（可选）。 */
  label?: ReactNode;
  /** `steps` 为空时的占位文案，缺省 `—`。 */
  emptyText?: ReactNode;
}

/** 三档状态 → antd `Steps` 的语义状态。 */
const STEP_STATUS: Record<LadderStepState, 'finish' | 'process' | 'wait'> = {
  done: 'finish',
  current: 'process',
  pending: 'wait',
};

export function LadderProgress(props: LadderProgressProps) {
  const { steps, label, emptyText } = props;

  if (steps.length === 0) {
    return <Typography.Text type="secondary">{emptyText ?? '—'}</Typography.Text>;
  }

  return (
    <Flex vertical gap={4} data-testid="ladder-progress">
      {label == null ? null : <Typography.Text type="secondary">{label}</Typography.Text>}
      <Steps
        titlePlacement="vertical"
        items={steps.map((step) => ({
          key: step.key,
          title: step.label,
          status: STEP_STATUS[step.state] ?? 'wait',
        }))}
      />
    </Flex>
  );
}