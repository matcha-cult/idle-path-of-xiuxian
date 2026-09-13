/**
 * QuantityInput —— 数量选择输入框，游戏语义通用组。
 *
 * 用途：炼丹材料数、购买数量、拆分堆叠等一切「选个数量」场景。
 * 约定：完全受控（`value` + `onChange`），antd `InputNumber` 承载 `min/max/step`；
 *       组件不做业务校验、不发请求、不含游戏数值。
 *
 * 插槽：`addonAfter`（透传 antd `InputNumber` 的后置区块）。
 * 边界：`min > max` 不抛错（原样透传，由调用方负责语义）；`value=0` 与 `undefined` 均可渲染；
 *       输入框清空时回传 `null`（而不是 `NaN`）。
 *
 * 实现说明：`addonAfter` 仅在调用方传入时才落到 antd（避免触发 antd v6 的
 * `addonAfter → Space.Compact` 弃用提示；props 契约不变）。
 */
import { InputNumber } from 'antd';
import type { ReactNode } from 'react';

export interface QuantityInputProps {
  /** 当前数量（受控）；`undefined` 表示未填，`0` 是合法值。 */
  value?: number;
  /** 数量变化回调；输入框清空时回传 `null`。 */
  onChange?: (value: number | null) => void;
  /** 最小值，缺省 1。 */
  min?: number;
  /** 最大值，缺省 99。 */
  max?: number;
  /** 步进，缺省 1。 */
  step?: number;
  /** 禁用态。 */
  disabled?: boolean;
  /** 占位文案（由调用方注入）。 */
  placeholder?: string;
  /** 后置说明区块，透传 antd `InputNumber`。 */
  addonAfter?: ReactNode;
}

export function QuantityInput(props: QuantityInputProps) {
  const { value, onChange, min = 1, max = 99, step = 1, disabled, placeholder, addonAfter } = props;
  return (
    <InputNumber<number>
      data-testid="quantity-input"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      {...(addonAfter === undefined ? {} : { addonAfter })}
      onChange={(next) => onChange?.(next ?? null)}
    />
  );
}
